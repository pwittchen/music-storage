// Track page: metadata for one track, a waveform player, and delete.

import {
  ICONS,
  deleteTrack,
  downloadUrl,
  el,
  formatDate,
  formatSize,
  formatTime,
  getToken,
  getTrack,
  streamUrl,
} from "./api.js";
import { apiErrorMessage, applyStaticText, mountLanguageSwitch, t } from "./i18n.js";

const detail = document.getElementById("detail");
const notice = document.getElementById("notice");
const id = new URLSearchParams(location.search).get("id");

const SEEK_STEP_SECONDS = 5;

let track = null;

function showNotice(message) {
  notice.textContent = message;
  notice.className = "notice error";
  notice.hidden = false;
}

// --- waveform ---------------------------------------------------------------

const BAR_COUNT = 180;
const COLORS = (() => {
  const styles = getComputedStyle(document.documentElement);
  return {
    played: styles.getPropertyValue("--accent").trim(),
    rest: styles.getPropertyValue("--waveform").trim(),
  };
})();

// Built once and reused across re-renders, so switching language does not restart
// playback or throw away the decoded peaks.
let player = null;
let audio = null;
let canvas = null;
let playButton = null;
let elapsedLabel = null;
let durationLabel = null;
let peaks = null;
let frame = null;

/** Peak amplitude per bar, normalised to 0..1. Null until the audio is decoded. */
async function decodePeaks(url) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  const bytes = await fetch(url).then((response) => response.arrayBuffer());
  const context = new AudioCtx();
  try {
    const decoded = await context.decodeAudioData(bytes);
    const samples = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(samples.length / BAR_COUNT));

    const bars = new Float32Array(BAR_COUNT);
    let loudest = 0;
    for (let i = 0; i < BAR_COUNT; i++) {
      let peak = 0;
      for (let j = i * step; j < (i + 1) * step && j < samples.length; j++) {
        peak = Math.max(peak, Math.abs(samples[j]));
      }
      bars[i] = peak;
      loudest = Math.max(loudest, peak);
    }
    if (loudest > 0) for (let i = 0; i < BAR_COUNT; i++) bars[i] /= loudest;
    return bars;
  } finally {
    context.close();
  }
}

function drawWaveform() {
  if (!canvas || !canvas.clientWidth) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const context = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
  const slot = width / BAR_COUNT;
  const barWidth = Math.max(1, slot - 1);

  for (let i = 0; i < BAR_COUNT; i++) {
    // A flat quiet line stands in until the peaks are decoded.
    const level = peaks ? peaks[i] : 0.08;
    const barHeight = Math.max(2, level * (height - 8));
    context.fillStyle = (i + 1) / BAR_COUNT <= progress ? COLORS.played : COLORS.rest;
    context.fillRect(i * slot, (height - barHeight) / 2, barWidth, barHeight);
  }

  updateTimes();
}

function resizeWaveform() {
  if (!canvas || !canvas.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  drawWaveform();
}

// --- player controls --------------------------------------------------------

function updateTimes() {
  const elapsed = formatTime(audio.currentTime);
  if (elapsedLabel.textContent !== elapsed) elapsedLabel.textContent = elapsed;

  const total = formatTime(audio.duration);
  if (durationLabel.textContent !== total) durationLabel.textContent = total;

  canvas.setAttribute("aria-valuemax", String(Math.floor(audio.duration || 0)));
  canvas.setAttribute("aria-valuenow", String(Math.floor(audio.currentTime)));
  canvas.setAttribute("aria-valuetext", elapsed);
}

function updatePlayButton() {
  const label = t(audio.paused ? "play" : "pause");
  playButton.innerHTML = ICONS[audio.paused ? "play" : "pause"];
  playButton.title = label;
  playButton.setAttribute("aria-label", label);
}

function seekTo(seconds) {
  if (!(audio.duration > 0)) return;
  audio.currentTime = Math.min(Math.max(seconds, 0), audio.duration);
  drawWaveform();
}

function tick() {
  drawWaveform();
  frame = requestAnimationFrame(tick);
}

function buildPlayer() {
  if (player) return;

  const url = streamUrl(track.id);
  audio = el("audio", { preload: "metadata", src: url });

  canvas = el("canvas", { className: "waveform", tabIndex: 0 });
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-valuemin", "0");

  elapsedLabel = el("span", { className: "player-elapsed" });
  durationLabel = el("span", { className: "player-duration" });
  playButton = el("button", { type: "button", className: "player-play" });

  player = el(
    "div",
    { className: "player" },
    playButton,
    el("div", { className: "player-wave" }, canvas, elapsedLabel, durationLabel),
    audio,
  );

  playButton.addEventListener("click", () => {
    if (audio.paused) audio.play().catch((e) => showNotice(t("cannotPlay", { message: e.message })));
    else audio.pause();
  });

  canvas.addEventListener("click", (event) => {
    const box = canvas.getBoundingClientRect();
    seekTo(((event.clientX - box.left) / box.width) * audio.duration);
  });

  canvas.addEventListener("keydown", (event) => {
    const jump = { ArrowLeft: -SEEK_STEP_SECONDS, ArrowRight: SEEK_STEP_SECONDS }[event.key];
    if (jump !== undefined) seekTo(audio.currentTime + jump);
    else if (event.key === "Home") seekTo(0);
    else if (event.key === "End") seekTo(audio.duration);
    else return;
    event.preventDefault();
  });

  audio.addEventListener("play", () => {
    updatePlayButton();
    if (frame === null) tick();
  });
  for (const event of ["pause", "ended"]) {
    audio.addEventListener(event, () => {
      cancelAnimationFrame(frame);
      frame = null;
      updatePlayButton();
      drawWaveform();
    });
  }
  for (const event of ["loadedmetadata", "seeked"]) {
    audio.addEventListener(event, drawWaveform);
  }
  audio.addEventListener("error", () => showNotice(t("playbackFailed")));
  window.addEventListener("resize", resizeWaveform);

  // The bytes are fetched a second time purely to decode them; the player itself
  // keeps streaming from the API so that seeking still uses range requests.
  decodePeaks(url)
    .then((decoded) => {
      peaks = decoded;
      drawWaveform();
    })
    .catch(() => {
      /* undecodable in this browser: the flat placeholder stays as the progress bar */
    });
}

// --- page -------------------------------------------------------------------

/** An action below the player: an icon followed by its label. */
function action(icon, label, tag = "button", props = {}) {
  const node = el(tag, { innerHTML: ICONS[icon], ...props });
  if (tag === "button") node.type = "button";
  else node.classList.add("btn");
  node.append(el("span", { textContent: label }));
  return node;
}

function render() {
  if (!track) {
    detail.replaceChildren(
      el("p", { className: "empty", textContent: t("notFound") }),
      el("a", { href: "/", textContent: t("backToAll") }),
    );
    return;
  }

  document.title = `${track.title} — music-storage`;
  buildPlayer();
  updatePlayButton();
  canvas.setAttribute("aria-label", t("seekHint"));
  canvas.title = t("seekHint");

  const fields = [
    ["fieldFilename", track.filename],
    ["fieldType", track.content_type],
    ["fieldSize", formatSize(track.size_bytes)],
    ["fieldUploaded", formatDate(track.uploaded_at)],
  ].flatMap(([key, value]) => [
    el("dt", { textContent: t(key) }),
    el("dd", { textContent: value }),
  ]);

  const actions = el(
    "div",
    { className: "detail-actions" },
    action("back", t("back"), "a", { href: "/" }),
  );

  // `download` names the saved file; the server sends the same name in its header.
  actions.append(
    action("download", t("download"), "a", {
      href: downloadUrl(track.id),
      download: track.filename,
    }),
  );

  // Deleting needs a stored token, so the action only appears once there is one.
  if (getToken()) {
    const remove = action("trash", t("delete"), "button", { className: "danger" });
    remove.addEventListener("click", () => confirmDelete(actions));
    actions.append(remove);
  }

  detail.replaceChildren(el("h1", { textContent: track.title }), el("dl", {}, ...fields), player, actions);
  resizeWaveform();
}

/** In-page confirmation, replacing the action buttons — no native confirm(). */
function confirmDelete(actions) {
  const original = [...actions.children];
  const restore = () => actions.replaceChildren(...original);

  const cancel = el("button", { type: "button", textContent: t("cancel") });
  cancel.addEventListener("click", restore);

  const yes = el("button", { type: "button", className: "danger", textContent: t("delete") });
  yes.addEventListener("click", async () => {
    yes.disabled = cancel.disabled = true;
    try {
      await deleteTrack(track.id, getToken());
      location.href = "/";
    } catch (e) {
      restore();
      showNotice(apiErrorMessage(e));
    }
  });

  actions.replaceChildren(
    el("span", { className: "confirm", textContent: t("confirmDelete") }),
    yes,
    cancel,
  );
}

applyStaticText(); // the header is translated before the metadata request resolves

try {
  track = await getTrack(id);
} catch {
  track = null;
}
mountLanguageSwitch(render); // also applies the static text on first load

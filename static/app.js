// Main page: upload, search, list, play/pause, delete.

import {
  ICONS,
  deleteTrack,
  el,
  formatDate,
  formatSize,
  formatTime,
  getToken,
  listTracks,
  setToken,
  streamUrl,
  uploadTrack,
} from "./api.js";
import { apiErrorMessage, mountLanguageSwitch, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const [search, notice, listContainer, player, form] = [
  "search",
  "notice",
  "list-container",
  "player",
  "upload-form",
].map($);
const [fileInput, titleInput, tokenInput, uploadButton, uploadToggle] = [
  "file",
  "title",
  "token",
  "upload-button",
  "toggle-upload",
].map($);
const [progressBar, progressTitle, progressFill, progressTime] = [
  "player-bar",
  "player-bar-title",
  "player-bar-fill",
  "player-bar-time",
].map($);

let tracks = [];
let currentQuery = "";
// The track the shared player is loaded with, held by reference so the progress bar
// keeps its title even when a search filters that track out of the list.
let playing = null;

function showNotice(message, kind = "error") {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = false;
}

// --- upload panel visibility ------------------------------------------------

const PANEL_KEY = "music-storage-upload-open";

/** The panel starts hidden; only an explicit "open" from a previous visit opens it. */
let panelOpen = (() => {
  try {
    return localStorage.getItem(PANEL_KEY) === "1";
  } catch {
    return false;
  }
})();

function renderPanel() {
  form.hidden = !panelOpen;
  uploadToggle.setAttribute("aria-expanded", String(panelOpen));
  uploadToggle.title = t(panelOpen ? "hideUpload" : "showUpload");
  uploadToggle.innerHTML = ICONS[panelOpen ? "minus" : "plus"];
  uploadToggle.append(el("span", { className: "label", textContent: uploadToggle.title }));
}

uploadToggle.addEventListener("click", () => {
  panelOpen = !panelOpen;
  try {
    localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0");
  } catch {
    /* private mode: the panel still toggles, the choice is just not remembered */
  }
  renderPanel();
  if (panelOpen) fileInput.focus();
});

/** A row action: an icon plus its label. */
function action(icon, label, tag = "button", props = {}) {
  const node = el(tag, { className: "icon", title: label, innerHTML: ICONS[icon], ...props });
  if (tag === "button") node.type = "button";
  else node.classList.add("btn");
  node.append(el("span", { className: "label", textContent: label }));
  return node;
}

// --- list rendering --------------------------------------------------------

function render() {
  const rows = tracks.map(renderRow);
  listContainer.replaceChildren(
    rows.length
      ? el("div", { className: "list" }, ...rows)
      : el("p", {
          className: "empty",
          textContent: currentQuery ? t("noMatch", { query: currentQuery }) : t("noTracks"),
        }),
  );
}

function renderRow(track) {
  const active = playing !== null && playing.id === track.id && !player.paused;

  const play = action(active ? "pause" : "play", active ? t("pause") : t("play"), "button", {
    className: "icon play",
  });
  play.addEventListener("click", () => toggle(track));

  const open = action("open", t("open"), "a", {
    href: `/track.html?id=${encodeURIComponent(track.id)}`,
  });

  const actions = el("div", { className: "row-actions" }, play, open);

  // Deleting needs a stored token, so the action only appears once there is one.
  if (getToken()) {
    const remove = action("trash", t("delete"), "button", { className: "icon danger" });
    remove.addEventListener("click", () => confirmDelete(actions, track));
    actions.append(remove);
  }

  return el(
    "div",
    { className: active ? "row playing" : "row" },
    el(
      "div",
      { className: "row-main" },
      el("div", { className: "row-title", textContent: track.title }),
      el("div", {
        className: "row-meta",
        textContent: `${track.filename} · ${formatSize(track.size_bytes)} · ${formatDate(track.uploaded_at)}`,
      }),
    ),
    actions,
  );
}

/** In-page confirmation, replacing the row's actions — no native confirm(). */
function confirmDelete(actions, track) {
  const original = [...actions.children];
  const restore = () => actions.replaceChildren(...original);

  const cancel = el("button", { type: "button", textContent: t("cancel") });
  cancel.addEventListener("click", restore);

  const yes = el("button", { type: "button", className: "danger", textContent: t("delete") });
  yes.addEventListener("click", async () => {
    yes.disabled = cancel.disabled = true;
    try {
      await deleteTrack(track.id, getToken());
      if (playing !== null && playing.id === track.id) stop();
      tracks = tracks.filter((other) => other.id !== track.id);
      render();
      showNotice(t("deleted", { title: track.title }), "ok");
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

// --- playback --------------------------------------------------------------

function toggle(track) {
  if (playing !== null && playing.id === track.id) {
    if (!player.paused) return player.pause();
  } else {
    playing = track;
    player.src = streamUrl(track.id);
  }
  player.play().catch((e) => showNotice(t("cannotPlay", { message: e.message })));
}

function stop() {
  player.pause();
  playing = null;
  player.removeAttribute("src");
  player.load();
  renderProgress();
}

/** The fixed bar at the bottom: what is playing and how far in. */
function renderProgress() {
  progressBar.hidden = playing === null;
  if (playing === null) return;

  const { currentTime, duration } = player;
  const ratio = Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0;
  progressTitle.textContent = playing.title;
  progressFill.style.width = `${(ratio * 100).toFixed(2)}%`;
  progressTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

// A frame loop keeps the fill smooth; it only runs while something is actually playing.
let progressFrame = null;
function tick() {
  renderProgress();
  progressFrame = requestAnimationFrame(tick);
}

player.addEventListener("play", () => {
  if (progressFrame === null) tick();
  render();
});
for (const event of ["pause", "ended"]) {
  player.addEventListener(event, () => {
    cancelAnimationFrame(progressFrame);
    progressFrame = null;
    renderProgress();
    render();
  });
}
player.addEventListener("loadedmetadata", renderProgress);
player.addEventListener("error", () => {
  if (playing !== null) showNotice(t("playbackFailed"));
});

// --- search ----------------------------------------------------------------

async function load(query = currentQuery) {
  currentQuery = query;
  try {
    tracks = await listTracks(query);
    render();
  } catch (e) {
    showNotice(apiErrorMessage(e));
  }
}

let searchTimer = null;
search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(search.value.trim()), 200);
});

// --- upload and token ------------------------------------------------------

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.hidden = true;

  const file = fileInput.files[0];
  const token = tokenInput.value.trim();
  if (!file) return showNotice(t("chooseFile"));
  if (!token) return showNotice(t("tokenRequired"));

  uploadButton.disabled = true;
  uploadButton.textContent = t("uploading");
  try {
    const track = await uploadTrack({ file, title: titleInput.value.trim(), token });
    form.reset();
    tokenInput.value = token;
    showNotice(t("uploaded", { title: track.title }), "ok");
    await load();
  } catch (e) {
    showNotice(apiErrorMessage(e));
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = t("upload");
  }
});

// The token lives in localStorage as it is typed; the delete actions follow it.
tokenInput.addEventListener("input", () => {
  const had = Boolean(getToken());
  setToken(tokenInput.value.trim());
  if (had !== Boolean(getToken())) render();
});

$("forget-token").addEventListener("click", () => {
  setToken("");
  tokenInput.value = "";
  render();
  showNotice(t("tokenForgotten"), "ok");
});

// --- start -----------------------------------------------------------------

tokenInput.value = getToken();
mountLanguageSwitch(() => {
  renderPanel(); // the toggle's label is built in JS, so it needs re-translating too
  render();
});
load("");

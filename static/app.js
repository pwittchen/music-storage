// Main page: search, list, play/pause, add to a playlist, delete. Adding a track and
// the token live in the navigation (nav.js).

import { ICONS, deleteTrack, downloadUrl, el, formatDate, formatSize, getToken, listTracks } from "./api.js";
import { applyAppTitle } from "./config.js";
import { apiErrorMessage, mountLanguageSwitch, t, tCount } from "./i18n.js";
import { mountNav } from "./nav.js";
import { mountListPlayer } from "./player.js";
import { forgetTrack } from "./playlist-store.js";
import { addToPlaylistModal, mountPlaylistNav } from "./playlist-ui.js";
import { mountThemeSwitch, renderThemeButton } from "./theme.js";

const $ = (id) => document.getElementById(id);
const [search, notice, listContainer, trackCount] = ["search", "notice", "list-container", "track-count"].map($);

let tracks = [];
let currentQuery = "";
// How many tracks are stored, which a search must not change: it is read from an
// unfiltered list and otherwise kept in step as tracks are uploaded and deleted.
let total = 0;

function showNotice(message, kind = "error") {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = false;
}

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
  // Nothing loaded yet, or nothing stored: the empty state already says so.
  trackCount.textContent = total ? tCount("trackCount", total) : "";

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
  const active = player.isPlaying(track.id);

  const play = action(active ? "pause" : "play", active ? t("pause") : t("play"), "button", {
    className: "icon play",
  });
  play.addEventListener("click", () => player.toggle(track));

  const open = action("open", t("open"), "a", {
    href: `/track.html?id=${encodeURIComponent(track.id)}`,
  });

  // `download` names the saved file; the server sends the same name in its header.
  const save = action("download", t("download"), "a", {
    href: downloadUrl(track.id),
    download: track.filename,
  });

  // A small icon-only button; the label is still there for screen readers and on hover.
  const add = el("button", {
    type: "button",
    className: "icon add",
    title: t("addToPlaylist"),
    innerHTML: ICONS.plus,
  });
  add.setAttribute("aria-label", t("addToPlaylist"));
  add.addEventListener("click", async () => {
    if (await addToPlaylistModal(track)) showNotice(t("playlistsSaved", { title: track.title }), "ok");
  });

  const actions = el("div", { className: "row-actions" }, play, open, save, add);

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
      if (player.isLoaded(track.id)) player.stop();
      forgetTrack(track.id);
      tracks = tracks.filter((other) => other.id !== track.id);
      total -= 1;
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

// Every play, pause and end redraws the list, so the active row follows the player.
const player = mountListPlayer({ onChange: render, onError: showNotice });

// --- search ----------------------------------------------------------------

async function load(query = currentQuery) {
  currentQuery = query;
  try {
    tracks = await listTracks(query);
    if (!query) total = tracks.length; // an unfiltered list is the whole library
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

// --- start -----------------------------------------------------------------

applyAppTitle();
mountThemeSwitch(); // the page draws nothing in theme colours itself; the CSS does it all
mountNav({
  notify: showNotice,
  onUploaded: () => {
    total += 1; // a reload of an unfiltered list overwrites this with the real count
    load();
  },
  onTokenChange: render, // the delete actions come and go with the token
});
mountPlaylistNav((playlist) => showNotice(t("playlistCreated", { name: playlist.name }), "ok"));
mountLanguageSwitch(() => {
  renderThemeButton();
  render();
});
load("");

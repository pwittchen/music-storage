// Playlists page: every playlist, or — with `?id=` — one of them, its tracks in play
// order, reordered by drag and drop, with an optional auto-play. The playlists live in
// this browser's localStorage (playlist-store.js); the tracks come from the API.

import { ICONS, el, formatSize, listTracks } from "./api.js";
import { appTitle, applyAppTitle } from "./config.js";
import { apiErrorMessage, mountLanguageSwitch, t, tCount } from "./i18n.js";
import { mountListPlayer } from "./player.js";
import { deletePlaylist, getPlaylist, listPlaylists, removeFromPlaylist, setOrder } from "./playlist-store.js";
import { confirmModal, mountPlaylistNav } from "./playlist-ui.js";
import { mountThemeSwitch, renderThemeButton } from "./theme.js";

const container = document.getElementById("playlists");
const notice = document.getElementById("notice");

// The playlist on show, or null for the list of all of them. Not const: deleting the
// playlist on show switches the page over to the list.
let id = new URLSearchParams(location.search).get("id");

// Every stored track by id, for the titles; null until the list has loaded.
let library = null;
// Off on every visit: a playlist only plays on by itself when asked to.
let autoplay = false;
// While a row is being dragged, redraws wait, so that one does not pull it from under the pointer.
let dragging = false;

// The playlist on show and the element holding its rows, refilled on every playback change.
let playlist = null;
let rowsNode = null;
// The previous / play-pause / next buttons of the playlist on show.
let transport = null;

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

const playlistUrl = (playlistId) => `/playlists.html?id=${encodeURIComponent(playlistId)}`;

function render() {
  if (id === null) renderAll();
  else renderPlaylist();
}

// --- all playlists ------------------------------------------------------------

function renderAll() {
  document.title = `${t("navPlaylists")} — ${appTitle}`;
  playlist = rowsNode = transport = null;

  const rows = listPlaylists().map((each) => {
    const remove = action("trash", t("delete"), "button", { className: "icon danger" });
    remove.addEventListener("click", () => confirmDelete(each));
    return el(
      "div",
      { className: "row" },
      el(
        "div",
        { className: "row-main" },
        el("a", { className: "row-title", href: playlistUrl(each.id), textContent: each.name }),
        el("div", { className: "row-meta", textContent: tCount("trackCount", each.trackIds.length) }),
      ),
      el(
        "div",
        { className: "row-actions" },
        action("open", t("open"), "a", { href: playlistUrl(each.id) }),
        remove,
      ),
    );
  });

  container.replaceChildren(
    el("h1", { className: "page-title", textContent: t("navPlaylists") }),
    rows.length
      ? el("div", { className: "list" }, ...rows)
      : el("p", { className: "empty", textContent: t("noPlaylists") }),
  );
}

async function confirmDelete(target) {
  const confirmed = await confirmModal({
    title: t("deletePlaylist"),
    message: t("confirmDeletePlaylist", { name: target.name }),
    confirmLabel: t("delete"),
  });
  if (!confirmed) return;

  deletePlaylist(target.id);
  if (id !== null) {
    // Deleted from its own view: there is nothing left to show there, so go to the list.
    player.stop();
    id = null;
    history.replaceState(null, "", "/playlists.html");
  }
  render();
  showNotice(t("playlistDeleted", { name: target.name }), "ok");
}

// --- one playlist -------------------------------------------------------------

function renderPlaylist() {
  playlist = getPlaylist(id);
  if (!playlist) {
    rowsNode = transport = null;
    document.title = appTitle;
    container.replaceChildren(
      el("p", { className: "empty", textContent: t("playlistNotFound") }),
      el("a", { href: "/playlists.html", textContent: t("backToPlaylists") }),
    );
    return;
  }

  document.title = `${playlist.name} — ${appTitle}`;

  const toggle = el("input", { type: "checkbox", className: "toggle", checked: autoplay });
  toggle.addEventListener("change", () => (autoplay = toggle.checked));

  const remove = action("trash", t("deletePlaylist"), "button", { className: "danger" });
  remove.addEventListener("click", () => confirmDelete(playlist));

  // Icons and labels are filled in by renderTransport, which follows the player.
  transport = {
    prev: el("button", { type: "button", innerHTML: ICONS.prev, title: t("prevTrack") }),
    play: el("button", { type: "button", className: "transport-play" }),
    next: el("button", { type: "button", innerHTML: ICONS.next, title: t("nextTrack") }),
  };
  transport.prev.setAttribute("aria-label", t("prevTrack"));
  transport.next.setAttribute("aria-label", t("nextTrack"));
  transport.prev.addEventListener("click", () => step(-1));
  transport.play.addEventListener("click", playPause);
  transport.next.addEventListener("click", () => step(1));

  rowsNode = el("div");
  container.replaceChildren(
    el("a", { className: "crumb", href: "/playlists.html", textContent: t("backToPlaylists") }),
    el("h1", { className: "page-title", textContent: playlist.name }),
    el(
      "div",
      { className: "playlist-bar" },
      el("div", { className: "transport" }, transport.prev, transport.play, transport.next),
      el("span", { className: "row-meta", textContent: tCount("trackCount", playlist.trackIds.length) }),
      el("label", { className: "autoplay", title: t("autoplayHint") }, toggle, t("autoplay")),
      remove,
    ),
    rowsNode,
  );
  refresh();
}

/** Whatever follows the player and the order: the rows and the transport buttons. */
function refresh() {
  renderRows();
  renderTransport();
}

/** Just the rows, so that play and pause leave the toggle and the focus where they are. */
function renderRows() {
  if (rowsNode === null || dragging) return;
  if (!playlist.trackIds.length) {
    rowsNode.replaceChildren(el("p", { className: "empty", textContent: t("playlistEmpty") }));
    return;
  }
  if (library === null) return rowsNode.replaceChildren(); // the titles are still loading

  rowsNode.replaceChildren(el("div", { className: "list" }, ...playlist.trackIds.map(renderRow)));
}

function renderRow(trackId, index) {
  const track = library.get(trackId);
  const active = track !== undefined && player.isPlaying(trackId);

  const handle = el("button", {
    type: "button",
    className: "handle",
    title: t("reorderHint"),
    innerHTML: ICONS.grip,
  });
  handle.setAttribute("aria-label", t("reorderHint"));

  const remove = action("close", t("removeFromPlaylist"), "button", { className: "icon danger" });
  remove.addEventListener("click", () => {
    removeFromPlaylist(playlist.id, trackId);
    render(); // the count in the bar above changes too
    showNotice(t("removedFromPlaylist", { title: track ? track.title : t("trackUnavailable") }), "ok");
  });

  const actions = el("div", { className: "row-actions" });
  // A track deleted from the library in the meantime stays listed, so that a server
  // started without its data does not quietly empty every playlist; it can be removed.
  if (track) {
    const play = action(active ? "pause" : "play", t(active ? "pause" : "play"), "button", {
      className: "icon play",
    });
    play.addEventListener("click", () => player.toggle(track));
    actions.append(play, action("open", t("open"), "a", { href: `/track.html?id=${encodeURIComponent(trackId)}` }));
  }
  actions.append(remove);

  const row = el(
    "div",
    { className: ["row", "sortable", active && "playing", !track && "unavailable"].filter(Boolean).join(" ") },
    handle,
    el("span", { className: "row-index", textContent: String(index + 1) }),
    el(
      "div",
      { className: "row-main" },
      el("div", { className: "row-title", textContent: track ? track.title : t("trackUnavailable") }),
      el("div", {
        className: "row-meta",
        textContent: track ? `${track.filename} · ${formatSize(track.size_bytes)}` : trackId,
      }),
    ),
    actions,
  );
  row.dataset.id = trackId;

  handle.addEventListener("pointerdown", (event) => startDrag(event, row));
  handle.addEventListener("keydown", (event) => moveByKey(event, trackId));
  return row;
}

// --- reordering ---------------------------------------------------------------

/**
 * Pointer events rather than the HTML drag-and-drop API, which does nothing on touch
 * screens. The row itself moves through the list as the pointer crosses the middle of
 * its neighbours, and the order is saved on release.
 */
function startDrag(event, row) {
  if (event.button !== 0) return;
  // No text selection while dragging. That also cancels the focus a press would give,
  // so it is given by hand: a click on the handle, then the arrow keys, works too.
  event.preventDefault();
  event.currentTarget.focus();
  dragging = true;
  const list = row.parentElement;
  row.classList.add("dragging");
  document.body.classList.add("sorting");

  // On the window, not captured by the handle: moving the row through the DOM would
  // release a pointer capture halfway through the drag.
  const move = (e) => {
    const before = [...list.children].find((other) => {
      if (other === row) return false;
      const box = other.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    if (before === undefined) {
      if (list.lastElementChild !== row) list.append(row);
    } else if (row.nextElementSibling !== before) {
      list.insertBefore(row, before);
    }
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    dragging = false;
    row.classList.remove("dragging");
    document.body.classList.remove("sorting");
    saveOrder([...list.children].map((node) => node.dataset.id), row.dataset.id);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/** The keyboard way to reorder: arrow keys on a focused handle move its row by one. */
function moveByKey(event, trackId) {
  const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
  if (step === undefined) return;
  event.preventDefault();

  const order = [...playlist.trackIds];
  const from = order.indexOf(trackId);
  const to = from + step;
  if (to < 0 || to >= order.length) return;
  order.splice(to, 0, ...order.splice(from, 1));
  saveOrder(order, trackId);
}

/** Save the order and renumber the rows, keeping the focus on the handle of the one moved. */
function saveOrder(order, movedId) {
  playlist = setOrder(playlist.id, order) ?? playlist;
  refresh(); // a new order can change what previous and next lead to
  rowsNode.querySelector(`[data-id="${CSS.escape(movedId)}"] .handle`)?.focus();
}

// --- playback -----------------------------------------------------------------

/** The loaded track when it is on the playlist on show, otherwise null. */
function currentOnPlaylist() {
  const current = player.current();
  return current !== null && playlist !== null && playlist.trackIds.includes(current.id)
    ? current
    : null;
}

/**
 * The playable track `offset` places from the loaded one — unavailable tracks are
 * skipped — or null at either end, or when nothing on this playlist is loaded.
 */
function neighbour(offset) {
  const current = currentOnPlaylist();
  if (current === null || library === null) return null;
  const ids = playlist.trackIds;
  for (let at = ids.indexOf(current.id) + offset; at >= 0 && at < ids.length; at += offset) {
    const track = library.get(ids[at]);
    if (track) return track;
  }
  return null;
}

/** Pause or resume the loaded track; with none from this playlist, start at the top. */
function playPause() {
  const current = currentOnPlaylist();
  if (current !== null) return player.toggle(current);
  const first = playlist.trackIds.map((trackId) => library?.get(trackId)).find(Boolean);
  if (first) player.play(first);
}

function step(offset) {
  const track = neighbour(offset);
  if (track) player.play(track);
}

function renderTransport() {
  if (transport === null) return;
  const current = currentOnPlaylist();
  const playing = current !== null && player.isPlaying(current.id);
  const label = t(playing ? "pause" : "play");
  transport.play.innerHTML = ICONS[playing ? "pause" : "play"];
  transport.play.title = label;
  transport.play.setAttribute("aria-label", label);
  transport.play.disabled =
    library === null || !playlist.trackIds.some((trackId) => library.has(trackId));
  transport.prev.disabled = neighbour(-1) === null;
  transport.next.disabled = neighbour(1) === null;
}

/** With auto-play on, a finished track hands over to the next playable one below it. */
function playNext() {
  if (autoplay) step(1);
}

const player = mountListPlayer({ onChange: refresh, onEnded: playNext, onError: showNotice });

// --- start --------------------------------------------------------------------

applyAppTitle();
mountThemeSwitch();
mountPlaylistNav((created) => {
  if (id === null) render(); // the new playlist joins the list on show
  showNotice(t("playlistCreated", { name: created.name }), "ok");
});
mountLanguageSwitch(() => {
  renderThemeButton();
  render();
}); // also applies the static text on first load

if (id !== null) {
  try {
    const tracks = await listTracks("");
    library = new Map(tracks.map((track) => [track.id, track]));
  } catch (e) {
    showNotice(apiErrorMessage(e));
  }
  refresh();
}

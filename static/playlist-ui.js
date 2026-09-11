// The modals shared by every page — create a playlist, put a track on playlists, confirm
// a deletion — and the "New playlist" button in the navigation under the header.

import { ICONS, el } from "./api.js";
import { t, tCount } from "./i18n.js";
import {
  NAME_MAX,
  cleanName,
  createPlaylist,
  listPlaylists,
  playlistsWith,
  setTrackPlaylists,
} from "./playlist-store.js";

/**
 * A native modal <dialog>, which brings the focus trap and Escape for free; the CSS
 * blurs the page behind it. `done` resolves with the value given to `close`, or with
 * undefined when it is dismissed by Escape or a click on the backdrop.
 */
function modal(heading, ...content) {
  const dialog = el(
    "dialog",
    { className: "modal" },
    el("div", { className: "modal-body" }, el("h2", { textContent: heading }), ...content),
  );
  dialog.setAttribute("aria-label", heading);

  let value;
  let resolve;
  const done = new Promise((r) => (resolve = r));

  // The body fills the dialog, so a click on the dialog itself is one on the backdrop.
  // It must also have started there: a text selection dragged out of an input must not
  // close the modal on release.
  let pressedOutside = false;
  dialog.addEventListener("pointerdown", (event) => (pressedOutside = event.target === dialog));
  dialog.addEventListener("click", (event) => {
    if (pressedOutside && event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    dialog.remove();
    resolve(value);
  });

  document.body.append(dialog);
  dialog.showModal();

  return {
    done,
    close(result) {
      value = result;
      dialog.close();
    },
  };
}

function modalActions(...buttons) {
  return el("div", { className: "modal-actions" }, ...buttons);
}

function nameInput(props = {}) {
  const input = el("input", {
    type: "text",
    maxLength: NAME_MAX,
    placeholder: t("playlistName"),
    autocomplete: "off",
    ...props,
  });
  input.setAttribute("aria-label", t("playlistName"));
  return input;
}

/** Resolves true only when the confirming button was pressed. */
export async function confirmModal({ title, message, confirmLabel }) {
  const cancel = el("button", { type: "button", textContent: t("cancel"), autofocus: true });
  const yes = el("button", { type: "button", className: "danger", textContent: confirmLabel });
  const dialog = modal(
    title,
    el("p", { className: "modal-text", textContent: message }),
    modalActions(cancel, yes),
  );
  cancel.addEventListener("click", () => dialog.close(false));
  yes.addEventListener("click", () => dialog.close(true));
  return (await dialog.done) === true;
}

/** Resolves with the new playlist, or undefined when nothing was created. */
export function createPlaylistModal() {
  const name = nameInput({ autofocus: true });
  const cancel = el("button", { type: "button", textContent: t("cancel") });
  const create = el("button", {
    type: "submit",
    className: "primary",
    textContent: t("create"),
    disabled: true,
  });
  const form = el("form", { className: "modal-form" }, name, modalActions(cancel, create));
  const dialog = modal(t("newPlaylist"), form);

  name.addEventListener("input", () => (create.disabled = !cleanName(name.value)));
  cancel.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (cleanName(name.value)) dialog.close(createPlaylist(name.value));
  });
  return dialog.done;
}

/**
 * Tick the playlists a track should be on — any number of them — or create a new one
 * on the spot. Resolves true when the choice was saved.
 */
export async function addToPlaylistModal(track) {
  const chosen = new Set(playlistsWith(track.id).map((playlist) => playlist.id));

  const choices = el("div", { className: "choices" });
  function renderChoices() {
    const playlists = listPlaylists();
    choices.replaceChildren(
      ...(playlists.length
        ? playlists.map((playlist) => {
            const box = el("input", { type: "checkbox", checked: chosen.has(playlist.id) });
            box.addEventListener("change", () => {
              if (box.checked) chosen.add(playlist.id);
              else chosen.delete(playlist.id);
            });
            return el(
              "label",
              { className: "choice" },
              box,
              el("span", { className: "choice-name", textContent: playlist.name }),
              el("span", {
                className: "choice-count",
                textContent: tCount("trackCount", playlist.trackIds.length),
              }),
            );
          })
        : [el("p", { className: "choices-empty", textContent: t("noPlaylistsYet") })]),
    );
  }

  // Creating is its own action and is kept even if the modal is then cancelled; the new
  // playlist comes ticked, since putting this track on it is why it was made here.
  const name = nameInput();
  const create = el("button", { type: "button", textContent: t("create"), disabled: true });
  function createFromInput() {
    if (!cleanName(name.value)) return;
    chosen.add(createPlaylist(name.value).id);
    name.value = "";
    create.disabled = true;
    renderChoices();
  }
  name.addEventListener("input", () => (create.disabled = !cleanName(name.value)));
  name.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    createFromInput();
  });
  create.addEventListener("click", createFromInput);

  const cancel = el("button", { type: "button", textContent: t("cancel") });
  const save = el("button", { type: "button", className: "primary", textContent: t("save") });

  renderChoices();
  const dialog = modal(
    t("addToPlaylist"),
    el("p", { className: "modal-sub", textContent: track.title }),
    choices,
    el("div", { className: "modal-create" }, name, create),
    modalActions(cancel, save),
  );

  cancel.addEventListener("click", () => dialog.close(false));
  save.addEventListener("click", () => {
    setTrackPlaylists(track.id, chosen);
    dialog.close(true);
  });
  return (await dialog.done) === true;
}

/** The "New playlist" button in `#nav`; `onCreated` gets the playlist it made. */
export function mountPlaylistNav(onCreated = () => {}) {
  const button = document.getElementById("new-playlist");
  const label = el("span");
  label.dataset.i18n = "newPlaylist"; // translated with the rest of the static text
  button.innerHTML = ICONS.plus;
  button.append(label);

  button.addEventListener("click", async () => {
    const playlist = await createPlaylistModal();
    if (playlist) onCreated(playlist);
  });
}

// The "Add track" and "Token" buttons in the navigation under the header, with their
// modals, and the drawer that the navigation moves into on a phone.

import { ICONS, el, getToken, setToken, uploadTrack } from "./api.js";
import { apiErrorMessage, t } from "./i18n.js";
import { closeOnBackdrop, modal, modalActions } from "./modal.js";

const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.flac,.ogg,.oga,.opus,.m4a,.aac,.aiff,.aif,.wma";

// The same breakpoint as the phone layout in style.css.
const PHONE = window.matchMedia("(max-width: 640px)");

/** A line for a failed action, shown inside the modal so that the modal can stay open. */
function errorLine() {
  return el("p", { className: "modal-error", hidden: true, role: "alert" });
}

function showError(line, message) {
  line.textContent = message;
  line.hidden = false;
}

/** Resolves with the uploaded track, or undefined when nothing was uploaded. */
function uploadModal() {
  const token = getToken();

  const file = el("input", { type: "file", accept: AUDIO_ACCEPT, autofocus: true });
  file.setAttribute("aria-label", t("fileLabel"));
  const title = el("input", { type: "text", placeholder: t("titlePlaceholder"), autocomplete: "off" });
  title.setAttribute("aria-label", t("titleLabel"));

  // The token is set in its own modal; this one only says that uploading needs it.
  const note = el("p", {
    className: token ? "modal-hint" : "modal-hint warn",
    textContent: t("tokenRequired"),
  });
  const error = errorLine();

  const cancel = el("button", { type: "button", textContent: t("cancel") });
  const upload = el("button", {
    type: "submit",
    className: "primary",
    textContent: t("upload"),
    disabled: true,
  });
  const form = el("form", { className: "modal-form" }, file, title, note, error, modalActions(cancel, upload));
  const { dialog, done, close } = modal(t("addTrack"), form);

  // An upload under way is seen through in the modal: it cannot be dismissed half-way.
  let busy = false;
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });

  file.addEventListener("change", () => (upload.disabled = !token || !file.files.length));
  cancel.addEventListener("click", () => close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !token || !file.files.length) return;

    busy = true;
    upload.disabled = cancel.disabled = true;
    upload.textContent = t("uploading");
    error.hidden = true;
    try {
      close(await uploadTrack({ file: file.files[0], title: title.value.trim(), token }));
    } catch (e) {
      showError(error, apiErrorMessage(e));
      busy = false;
      upload.disabled = cancel.disabled = false;
      upload.textContent = t("upload");
    }
  });
  return done;
}

/** Resolves with "remembered" or "forgotten", or undefined when nothing changed. */
function tokenModal() {
  const stored = getToken();

  const status = el("p", {
    className: stored ? "token-status stored" : "token-status",
    textContent: t(stored ? "tokenStatusOn" : "tokenStatusOff"),
  });
  const input = el("input", {
    type: "password",
    value: stored,
    placeholder: t("tokenPlaceholder"),
    autocomplete: "off",
    autofocus: true,
  });
  input.setAttribute("aria-label", t("tokenLabel"));
  const hint = el("p", { className: "modal-hint", textContent: t("tokenHint") });
  const error = errorLine();

  const forget = el("button", {
    type: "button",
    className: "linkish",
    textContent: t("forgetToken"),
    disabled: !stored,
  });
  const cancel = el("button", { type: "button", textContent: t("cancel") });
  const remember = el("button", { type: "submit", className: "primary", textContent: t("rememberToken") });
  const form = el(
    "form",
    { className: "modal-form" },
    status,
    input,
    hint,
    error,
    modalActions(forget, cancel, remember),
  );
  const { done, close } = modal(t("token"), form);

  cancel.addEventListener("click", () => close());
  forget.addEventListener("click", () => {
    setToken("");
    close("forgotten");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = input.value.trim();
    if (!token) {
      showError(error, t("tokenEmpty"));
      return input.focus();
    }
    setToken(token);
    close("remembered");
  });
  return done;
}

/** An icon plus a label that `applyStaticText` translates with the rest of the page. */
function navButton(button, icon, key) {
  const label = el("span");
  label.dataset.i18n = key;
  button.innerHTML = ICONS[icon];
  button.append(label);
}

/**
 * The drawer the navigation row and the language switch move into on a phone, opened by
 * the `#menu` button in the header. There is one copy of those controls in the page;
 * they are moved into the drawer and back as the width crosses the breakpoint, so their
 * own listeners keep working wherever they are.
 */
function mountDrawer() {
  const menu = document.getElementById("menu");
  menu.innerHTML = ICONS.menu;

  const title = el("span", { className: "drawer-title" });
  title.dataset.i18n = "menu";
  const closeButton = el("button", { type: "button", className: "drawer-close", innerHTML: ICONS.close });
  closeButton.dataset.i18nLabel = "closeMenu";
  const body = el("div", { className: "drawer-body" }, el("div", { className: "drawer-head" }, title, closeButton));
  const drawer = el("dialog", { className: "drawer" }, body);
  drawer.dataset.i18nLabel = "menu";
  closeOnBackdrop(drawer);
  document.body.append(drawer);

  // Each control, with a marker in the page where it goes back to on a wider screen.
  const parts = [document.querySelector(".wrap > .nav"), document.getElementById("lang")]
    .filter(Boolean)
    .map((node) => {
      const home = document.createComment("");
      node.before(home);
      return { node, home };
    });

  function place() {
    if (!PHONE.matches && drawer.open) drawer.close();
    for (const { node, home } of parts) {
      if (!node.isConnected) continue; // the language switch, removed when the language is pinned
      if (PHONE.matches) body.append(node);
      else home.after(node);
    }
  }
  PHONE.addEventListener("change", place);
  place();

  menu.addEventListener("click", () => {
    drawer.showModal();
    menu.setAttribute("aria-expanded", "true");
  });
  drawer.addEventListener("close", () => menu.setAttribute("aria-expanded", "false"));

  // Whatever is picked in the drawer — a page, a modal, the close button — takes over
  // from it; only the language switch leaves it open. In the capture phase, so that the
  // drawer is closed before a button's own handler opens its modal.
  drawer.addEventListener(
    "click",
    (event) => {
      const picked = event.target.closest("a, button");
      if (picked && !picked.closest(".lang")) drawer.close();
    },
    true,
  );
}

/**
 * Wire up `#add-track`, `#token-button` and the phone drawer. `notify(message, kind)`
 * shows the page's notice; `onUploaded` gets the new track and `onTokenChange` runs
 * after a token is remembered or forgotten, for whatever the page draws from them.
 * Call it before the page's static text is translated.
 */
export function mountNav({ notify, onUploaded = () => {}, onTokenChange = () => {} }) {
  const addButton = document.getElementById("add-track");
  const tokenButton = document.getElementById("token-button");
  navButton(addButton, "upload", "addTrack");
  navButton(tokenButton, "key", "token");

  // The key icon turns accent while a token is remembered.
  const renderTokenButton = () => tokenButton.classList.toggle("stored", Boolean(getToken()));
  renderTokenButton();

  addButton.addEventListener("click", async () => {
    const track = await uploadModal();
    if (!track) return;
    notify(t("uploaded", { title: track.title }), "ok");
    onUploaded(track);
  });

  tokenButton.addEventListener("click", async () => {
    const change = await tokenModal();
    if (!change) return;
    renderTokenButton();
    notify(t(change === "remembered" ? "tokenRemembered" : "tokenForgotten"), "ok");
    onTokenChange();
  });

  mountDrawer();
}

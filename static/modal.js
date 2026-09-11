// The native <dialog> every modal is built on, shared by the playlist modals and the
// ones behind "Add track" and "Token".

import { el } from "./api.js";

/**
 * Close `dialog` on a click on its backdrop. Its content must fill it, so that a click
 * on the dialog itself is one on the backdrop, and the press must also have started
 * there: a text selection dragged out of an input must not close it on release. The
 * click goes through a cancelable `cancel` event first, as Escape does, so a single
 * listener can hold the dialog open against both.
 */
export function closeOnBackdrop(dialog) {
  let pressedOutside = false;
  dialog.addEventListener("pointerdown", (event) => (pressedOutside = event.target === dialog));
  dialog.addEventListener("click", (event) => {
    if (!pressedOutside || event.target !== dialog) return;
    if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
  });
}

/**
 * A modal <dialog>, which brings the focus trap and Escape for free; the CSS blurs the
 * page behind it. `done` resolves with the value given to `close`, or with undefined
 * when it is dismissed by Escape or a click on the backdrop.
 */
export function modal(heading, ...content) {
  const dialog = el(
    "dialog",
    { className: "modal" },
    el("div", { className: "modal-body" }, el("h2", { textContent: heading }), ...content),
  );
  dialog.setAttribute("aria-label", heading);
  closeOnBackdrop(dialog);

  let value;
  let resolve;
  const done = new Promise((r) => (resolve = r));

  dialog.addEventListener("close", () => {
    dialog.remove();
    resolve(value);
  });

  document.body.append(dialog);
  dialog.showModal();

  return {
    dialog,
    done,
    close(result) {
      value = result;
      dialog.close();
    },
  };
}

export function modalActions(...buttons) {
  return el("div", { className: "modal-actions" }, ...buttons);
}

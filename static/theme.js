// The dark/light switch shared by both pages. Dark is the default; the choice is
// remembered in localStorage under the key each page's <head> reads inline, so a
// remembered light theme is applied before the first paint instead of flashing dark.

import { ICONS } from "./api.js";
import { t } from "./i18n.js";

const THEME_KEY = "plainsong-theme";

// The inline snippet has already set the attribute; anything else means dark.
let current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
let button = null;

export function theme() {
  return current;
}

/** The button shows the theme it switches to, so it needs re-translating with the page. */
export function renderThemeButton() {
  if (!button) return;
  const next = current === "dark" ? "light" : "dark";
  const label = t(next === "light" ? "themeLight" : "themeDark");
  button.innerHTML = ICONS[next === "light" ? "sun" : "moon"];
  button.title = label;
  button.setAttribute("aria-label", label);
}

/**
 * Wire up the `#theme` button. `onChange` is for whatever a page draws itself in
 * theme colours — the CSS handles everything else.
 */
export function mountThemeSwitch(onChange = () => {}) {
  button = document.getElementById("theme");

  button.addEventListener("click", () => {
    current = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = current;
    try {
      localStorage.setItem(THEME_KEY, current);
    } catch {
      /* private mode: the theme still switches, the choice is just not remembered */
    }
    renderThemeButton();
    onChange();
  });

  document.documentElement.dataset.theme = current;
  renderThemeButton();
}

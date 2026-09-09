// Server-side interface settings, read once before either page draws anything:
// an optionally pinned language and an optional header title. Both are unset by
// default, and then the interface behaves exactly as it does without them.

let settings = { lang: null, title: null };
try {
  const response = await fetch("/api/config");
  if (response.ok) settings = await response.json();
} catch {
  /* the server is unreachable: the pages fall back to their built-in defaults */
}

/** The language the server pins the interface to, or null when the visitor picks. */
export const pinnedLang = settings.lang;

/** What the header and the tab are called — "plainsong" unless the server renames it. */
export const appTitle = settings.title || "plainsong";

/**
 * Put a configured title in the header and the tab. A no-op without one, so the
 * two-tone "plainsong" written into the HTML stays as it is.
 */
export function applyAppTitle() {
  if (!settings.title) return;
  document.title = settings.title;
  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = settings.title;
}

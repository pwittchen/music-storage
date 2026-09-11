// UI strings for English and Polish, plus the language switch shared by both pages.
// The chosen language is remembered in localStorage, unless the server pins one.

import { pinnedLang } from "./config.js";

const STRINGS = {
  en: {
    searchPlaceholder: "Search title or filename…",
    searchLabel: "Search tracks",
    fileLabel: "Audio file",
    titlePlaceholder: "Title (optional)",
    titleLabel: "Title",
    tokenPlaceholder: "Auth token",
    tokenLabel: "Auth token",
    tokenHint: "The token is kept in this browser only. It is needed to upload and delete.",
    rememberToken: "Remember token",
    forgetToken: "Forget token",
    tokenStatusOn: "Token remembered in this browser.",
    tokenStatusOff: "No token remembered.",
    tokenRemembered: "Token remembered.",
    tokenEmpty: "Enter a token first.",
    addTrack: "Add track",
    token: "Token",
    menu: "Menu",
    closeMenu: "Close menu",
    themeLight: "Light theme",
    themeDark: "Dark theme",
    upload: "Upload",
    uploading: "Uploading…",
    play: "Play",
    pause: "Pause",
    open: "Open",
    download: "Download",
    delete: "Delete",
    cancel: "Cancel",
    back: "Back",
    backToAll: "← Back to all tracks",
    confirmDelete: "Delete this track?",
    trackCount_one: "{count} track",
    trackCount_other: "{count} tracks",
    noTracks: "No tracks yet. Upload an audio file to get started.",
    noMatch: "Nothing matches “{query}”.",
    uploaded: "Uploaded “{title}”.",
    deleted: "Deleted “{title}”.",
    tokenForgotten: "Token forgotten.",
    tokenRequired: "A valid token is needed to add a track.",
    cannotPlay: "Cannot play this file: {message}",
    playbackFailed: "Playback failed — the file could not be loaded.",
    notFound: "Track not found.",
    seekHint: "Click the waveform to seek",
    fieldFilename: "Filename",
    fieldType: "Type",
    fieldSize: "Size",
    fieldUploaded: "Uploaded",
    fieldPlaylists: "Playlists",
    navLabel: "Sections",
    navTracks: "Tracks",
    navPlaylists: "Playlists",
    newPlaylist: "New playlist",
    playlistName: "Playlist name",
    create: "Create",
    save: "Save",
    addToPlaylist: "Add to playlist",
    noPlaylistsYet: "No playlists yet — create the first one below.",
    noPlaylists: "No playlists yet. Create one with “New playlist” above.",
    playlistCreated: "Created playlist “{name}”.",
    playlistDeleted: "Deleted playlist “{name}”.",
    playlistsSaved: "Playlists updated for “{title}”.",
    deletePlaylist: "Delete playlist",
    confirmDeletePlaylist: "Delete the playlist “{name}”? The tracks themselves stay in the library.",
    playlistNotFound: "Playlist not found.",
    backToPlaylists: "← All playlists",
    playlistEmpty: "This playlist is empty. Add tracks with the + button next to a track.",
    prevTrack: "Previous track",
    nextTrack: "Next track",
    autoplay: "Auto-play",
    autoplayHint: "Play the next track on the playlist when one ends",
    reorderHint: "Drag to reorder, or focus and use the arrow keys",
    removeFromPlaylist: "Remove from playlist",
    removedFromPlaylist: "Removed “{title}” from the playlist.",
    trackUnavailable: "Track no longer available",
    err401: "Missing or malformed auth token.",
    err403: "Invalid auth token.",
    err404: "Not found.",
    err413: "The file is larger than the allowed upload limit.",
    err415: "Unsupported file type — audio files only.",
    errNetwork: "Cannot reach the server.",
  },
  pl: {
    searchPlaceholder: "Szukaj tytułu lub nazwy pliku…",
    searchLabel: "Szukaj utworów",
    fileLabel: "Plik audio",
    titlePlaceholder: "Tytuł (opcjonalnie)",
    titleLabel: "Tytuł",
    tokenPlaceholder: "Token",
    tokenLabel: "Token",
    tokenHint: "Token zostaje tylko w tej przeglądarce. Jest potrzebny do wysyłania i usuwania.",
    rememberToken: "Zapamiętaj token",
    forgetToken: "Zapomnij token",
    tokenStatusOn: "Token zapamiętany w tej przeglądarce.",
    tokenStatusOff: "Brak zapamiętanego tokenu.",
    tokenRemembered: "Token zapamiętany.",
    tokenEmpty: "Najpierw wpisz token.",
    addTrack: "Dodaj utwór",
    token: "Token",
    menu: "Menu",
    closeMenu: "Zamknij menu",
    themeLight: "Jasny motyw",
    themeDark: "Ciemny motyw",
    upload: "Wyślij",
    uploading: "Wysyłanie…",
    play: "Odtwórz",
    pause: "Wstrzymaj",
    open: "Otwórz",
    download: "Pobierz",
    delete: "Usuń",
    cancel: "Anuluj",
    back: "Wróć",
    backToAll: "← Wróć do listy",
    confirmDelete: "Usunąć ten utwór?",
    trackCount_one: "{count} utwór",
    trackCount_few: "{count} utwory",
    trackCount_many: "{count} utworów",
    noTracks: "Nie ma tu jeszcze nic. Wyślij plik audio, żeby zacząć.",
    noMatch: "Nic nie pasuje do „{query}”.",
    uploaded: "Wysłano „{title}”.",
    deleted: "Usunięto „{title}”.",
    tokenForgotten: "Token zapomniany.",
    tokenRequired: "Do dodania utworu potrzebny jest prawidłowy token.",
    cannotPlay: "Nie da się odtworzyć tego pliku: {message}",
    playbackFailed: "Odtwarzanie się nie udało — nie można wczytać pliku.",
    notFound: "Nie znaleziono utworu.",
    seekHint: "Kliknij falę, żeby przewinąć",
    fieldFilename: "Nazwa pliku",
    fieldType: "Typ",
    fieldSize: "Rozmiar",
    fieldUploaded: "Dodano",
    fieldPlaylists: "Playlisty",
    navLabel: "Sekcje",
    navTracks: "Utwory",
    navPlaylists: "Playlisty",
    newPlaylist: "Nowa playlista",
    playlistName: "Nazwa playlisty",
    create: "Utwórz",
    save: "Zapisz",
    addToPlaylist: "Dodaj do playlisty",
    noPlaylistsYet: "Nie masz jeszcze żadnej playlisty — utwórz pierwszą poniżej.",
    noPlaylists: "Nie ma jeszcze żadnej playlisty. Utwórz ją przyciskiem „Nowa playlista” powyżej.",
    playlistCreated: "Utworzono playlistę „{name}”.",
    playlistDeleted: "Usunięto playlistę „{name}”.",
    playlistsSaved: "Zaktualizowano playlisty dla „{title}”.",
    deletePlaylist: "Usuń playlistę",
    confirmDeletePlaylist: "Usunąć playlistę „{name}”? Same utwory zostaną w bibliotece.",
    playlistNotFound: "Nie znaleziono playlisty.",
    backToPlaylists: "← Wszystkie playlisty",
    playlistEmpty: "Ta playlista jest pusta. Dodaj utwory przyciskiem + przy utworze.",
    prevTrack: "Poprzedni utwór",
    nextTrack: "Następny utwór",
    autoplay: "Autoodtwarzanie",
    autoplayHint: "Po zakończeniu utworu odtwarzaj kolejny z playlisty",
    reorderHint: "Przeciągnij, żeby zmienić kolejność, albo zaznacz i użyj strzałek",
    removeFromPlaylist: "Usuń z playlisty",
    removedFromPlaylist: "Usunięto „{title}” z playlisty.",
    trackUnavailable: "Utwór nie jest już dostępny",
    err401: "Brak tokenu albo błędny nagłówek.",
    err403: "Błędny token.",
    err404: "Nie znaleziono.",
    err413: "Plik jest większy niż dozwolony limit.",
    err415: "Nieobsługiwany typ pliku — tylko pliki audio.",
    errNetwork: "Brak połączenia z serwerem.",
  },
};

const LANG_KEY = "plainsong-lang";

// A language the server pins the interface to; the switch is then left out entirely.
// It is checked against the strings so that only a language we actually have wins.
const pinned = pinnedLang && pinnedLang in STRINGS ? pinnedLang : null;

function initialLang() {
  if (pinned) return pinned;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved in STRINGS) return saved;
  } catch {
    /* private mode: fall back to the browser language */
  }
  return (navigator.language || "en").toLowerCase().startsWith("pl") ? "pl" : "en";
}

let current = initialLang();

export function lang() {
  return current;
}

/** A translated string; `{name}` placeholders are filled from `vars`. */
export function t(key, vars = {}) {
  const template = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

/**
 * A translated string whose wording depends on a number, e.g. `1 utwór` / `5 utworów`.
 * The plural forms are stored as `key_one`, `key_few`, … — whichever the language has.
 */
export function tCount(key, count) {
  return t(`${key}_${new Intl.PluralRules(current).select(count)}`, { count });
}

/** A translated message for a failed API call, falling back to the server's own text. */
export function apiErrorMessage(error) {
  const key = error.status ? `err${error.status}` : "errNetwork";
  return STRINGS[current][key] || STRINGS.en[key] || error.message;
}

/** Translate everything marked up with `data-i18n*` attributes. */
export function applyStaticText(root = document) {
  document.documentElement.lang = current;
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of root.querySelectorAll("[data-i18n-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  }
}

/**
 * Wire up the `#lang` button group. `onChange` re-renders whatever the page draws
 * itself; it is also called once on load so pages have a single render path.
 *
 * With a pinned language there is nothing left to choose, so the group is removed
 * and the page is drawn once in that language.
 */
export function mountLanguageSwitch(onChange) {
  const group = document.getElementById("lang");

  if (pinned) {
    group.remove();
    applyStaticText();
    onChange();
    return;
  }

  const sync = () => {
    for (const button of group.children) {
      button.setAttribute("aria-pressed", String(button.dataset.lang === current));
    }
    applyStaticText();
    onChange();
  };

  for (const button of group.children) {
    button.addEventListener("click", () => {
      if (button.dataset.lang === current) return;
      current = button.dataset.lang;
      try {
        localStorage.setItem(LANG_KEY, current);
      } catch {
        /* private mode: the choice lasts for this page only */
      }
      sync();
    });
  }

  sync();
}

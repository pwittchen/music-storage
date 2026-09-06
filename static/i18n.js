// UI strings for English and Polish, plus the language switch shared by both pages.
// The chosen language is remembered in localStorage.

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
    showUpload: "Add track",
    hideUpload: "Hide",
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
    noTracks: "No tracks yet. Upload an audio file to get started.",
    noMatch: "Nothing matches “{query}”.",
    uploaded: "Uploaded “{title}”.",
    deleted: "Deleted “{title}”.",
    tokenForgotten: "Token forgotten.",
    chooseFile: "Choose an audio file first.",
    tokenRequired: "Remember an auth token first — uploading needs one.",
    cannotPlay: "Cannot play this file: {message}",
    playbackFailed: "Playback failed — the file could not be loaded.",
    notFound: "Track not found.",
    seekHint: "Click the waveform to seek",
    fieldFilename: "Filename",
    fieldType: "Type",
    fieldSize: "Size",
    fieldUploaded: "Uploaded",
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
    showUpload: "Dodaj utwór",
    hideUpload: "Ukryj",
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
    noTracks: "Nie ma tu jeszcze nic. Wyślij plik audio, żeby zacząć.",
    noMatch: "Nic nie pasuje do „{query}”.",
    uploaded: "Wysłano „{title}”.",
    deleted: "Usunięto „{title}”.",
    tokenForgotten: "Token zapomniany.",
    chooseFile: "Najpierw wybierz plik audio.",
    tokenRequired: "Najpierw zapamiętaj token — bez niego nie wyślesz pliku.",
    cannotPlay: "Nie da się odtworzyć tego pliku: {message}",
    playbackFailed: "Odtwarzanie się nie udało — nie można wczytać pliku.",
    notFound: "Nie znaleziono utworu.",
    seekHint: "Kliknij falę, żeby przewinąć",
    fieldFilename: "Nazwa pliku",
    fieldType: "Typ",
    fieldSize: "Rozmiar",
    fieldUploaded: "Dodano",
    err401: "Brak tokenu albo błędny nagłówek.",
    err403: "Błędny token.",
    err404: "Nie znaleziono.",
    err413: "Plik jest większy niż dozwolony limit.",
    err415: "Nieobsługiwany typ pliku — tylko pliki audio.",
    errNetwork: "Brak połączenia z serwerem.",
  },
};

const LANG_KEY = "plainsong-lang";

function initialLang() {
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
 */
export function mountLanguageSwitch(onChange) {
  const group = document.getElementById("lang");

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

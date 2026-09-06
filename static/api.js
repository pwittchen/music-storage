// Tiny fetch wrapper around /api, plus the formatting and DOM helpers both pages need.

import { lang } from "./i18n.js";

/** Inline icons, shared by the list rows and the track page player. */
export const ICONS = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5-9-5.5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3.2v11H4zM8.8 2.5H12v11H8.8z"/></svg>',
  open: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2h5v5h-1.5V4.56L7.3 9.76 6.24 8.7l5.2-5.2H9V2zM2.5 4H7v1.5H4v6.5h6.5V9H12v4.5H2.5V4z"/></svg>',
  trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 1.5h3l.5 1H13V4H3V2.5h3l.5-1zM4 5.5h8l-.6 8.2a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L4 5.5z"/></svg>',
  download:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 1.5h1.5v6.19l2.22-2.22 1.06 1.06L8 11.56 3.97 6.53l1.06-1.06 2.22 2.22V1.5zM2.5 12h11v1.5h-11z"/></svg>',
  back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.47 2.47l1.06 1.06L4.81 7.25H13.5v1.5H4.81l3.72 3.72-1.06 1.06L1.94 8l5.53-5.53z"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 2.5h1.5v4.75H13.5v1.5H8.75V13.5h-1.5V8.75H2.5v-1.5h4.75V2.5z"/></svg>',
  minus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.25h11v1.5h-11z"/></svg>',
};

/** `el("div", { className: "row" }, child, …)` — text is always set as text, never HTML. */
export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const TOKEN_KEY = "plainsong-token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the token simply is not remembered */
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    // The status lets the UI show a translated message; the server text is the fallback.
    const error = new Error((body && body.error) || `request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function listTracks(query) {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return request(`/api/tracks${suffix}`);
}

export function getTrack(id) {
  return request(`/api/tracks/${encodeURIComponent(id)}`);
}

export function streamUrl(id) {
  return `/api/tracks/${encodeURIComponent(id)}/stream`;
}

/** The same bytes as `streamUrl`, served with `Content-Disposition: attachment`. */
export function downloadUrl(id) {
  return `/api/tracks/${encodeURIComponent(id)}/download`;
}

export function uploadTrack({ file, title, token }) {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  return request("/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

export function deleteTrack(id, token) {
  return request(`/api/tracks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(lang(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

# music-storage — Specification

Self-hosted web app and REST API for storing, browsing and playing music files.

The guiding principle of this project is **simplicity**. No database, no frontend build
step, no framework on the client side, no user accounts. A single Rust binary plus a
handful of static files. Every decision below should be re-checked against that rule:
if something can be dropped without losing a listed requirement, it gets dropped.

---

## 1. Scope

### In scope

- Uploading audio files (music and sound files only)
- Browsing all stored files on a single page
- A dedicated page per file, reachable from the main page
- Deleting files
- Searching files by filename and title
- Playing / pausing a file in the browser
- Metadata (filename, title) stored in a CSV file on disk
- REST API: mutating endpoints protected by a static auth token, read endpoints public

### Out of scope (explicitly not built)

- User accounts, registration, sessions, roles
- Playlists, albums, artists, genres, tags, ratings, play counts
- Audio transcoding, waveform generation, ID3 tag parsing
- Cover art / thumbnails
- Streaming to external clients, mobile apps
- Pagination, infinite scroll (a flat list is enough)
- Database of any kind, ORM, migrations
- Frontend framework, bundler, npm, TypeScript
- HTTPS termination (assume a reverse proxy in front, if needed)
- Multi-tenancy, multi-instance deployment, horizontal scaling

---

## 2. Technology

| Layer | Choice |
| --- | --- |
| Language | Rust (stable, 2021 edition) |
| HTTP server | `axum` + `tokio` |
| Multipart upload | `axum` built-in multipart extractor |
| CSV metadata | `csv` crate |
| Serialization | `serde` / `serde_json` |
| IDs | `uuid` (v4) |
| Static files + range requests | `tower-http` (`ServeDir`, `ServeFile`) |
| Frontend | Vanilla JS (ES modules, no build step), plain CSS, plain HTML |
| Audio playback | Native `<audio>` element |

No client-side dependencies are fetched from a CDN. Everything is served by the Rust binary.

---

## 3. Data model

A single entity: **Track**.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string (UUID v4) | Primary key, generated on upload |
| `filename` | string | Original filename as provided by the client, sanitized |
| `title` | string | Human-readable title; defaults to filename without extension if not given |
| `content_type` | string | MIME type accepted at upload time |
| `size_bytes` | u64 | Size of the stored file |
| `uploaded_at` | string | RFC 3339 UTC timestamp |

### Storage layout

```
<DATA_DIR>/
  metadata.csv         # one row per track, header row included
  files/
    <uuid>.<ext>       # the audio files, named by id — never by user input
```

`metadata.csv` format (header + rows, standard RFC 4180 quoting handled by the `csv` crate):

```csv
id,filename,title,content_type,size_bytes,uploaded_at
7f1c...,song.mp3,My Song,audio/mpeg,4210233,2026-09-03T12:00:00Z
```

### Concurrency and consistency

- The whole metadata set is small enough to keep in memory: load the CSV into a
  `Vec<Track>` at startup, guard it with a `tokio::sync::RwLock`.
- Any mutation updates the in-memory list and then rewrites the whole CSV file
  (write to `metadata.csv.tmp`, `fsync`, then atomically rename over `metadata.csv`).
- Order of operations on upload: write the audio file first, then append metadata.
  On delete: remove the metadata row first, then delete the audio file. This way a
  crash can leave an orphaned file on disk but never a metadata row without a file.

---

## 4. Accepted file types

Upload is rejected unless **both** checks pass:

1. **Extension** (case-insensitive) is one of:
   `.mp3`, `.wav`, `.flac`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.aac`, `.aiff`, `.aif`, `.wma`
2. **MIME type** of the multipart part starts with `audio/`, or is one of the known
   aliases browsers send for audio: `application/ogg`, `application/octet-stream`
   *(the last one only when the extension is on the allow-list)*.

Anything else → `415 Unsupported Media Type`.

A maximum upload size is enforced (default **100 MB**, configurable). Exceeding it →
`413 Payload Too Large`.

---

## 5. REST API

Base path: `/api`. All responses are JSON except the audio stream.

### Public (no auth)

#### `GET /api/tracks`
List all tracks, newest first.

Optional query parameter `q` — case-insensitive substring search over `filename` and
`title`. Empty or missing `q` returns everything.

```
GET /api/tracks?q=jazz
200 OK
[
  {
    "id": "7f1c...",
    "filename": "song.mp3",
    "title": "My Song",
    "content_type": "audio/mpeg",
    "size_bytes": 4210233,
    "uploaded_at": "2026-09-03T12:00:00Z"
  }
]
```

#### `GET /api/tracks/{id}`
Single track metadata. `404` if unknown.

#### `GET /api/tracks/{id}/stream`
The audio bytes. Serves `Content-Type` from the stored metadata and supports HTTP
range requests (`Accept-Ranges: bytes`) so seeking works in the `<audio>` element.
`404` if unknown.

#### `GET /api/tracks/{id}/download`
The same bytes, but with `Content-Disposition: attachment` naming the original
filename, so the browser saves the file instead of playing it. `404` if unknown.

### Protected (auth token required)

#### `POST /api/tracks`
`multipart/form-data` upload.

| Part | Required | Description |
| --- | --- | --- |
| `file` | yes | The audio file |
| `title` | no | Title; falls back to the filename without extension |

```
201 Created
{ "id": "7f1c...", "filename": "song.mp3", "title": "My Song", ... }
```

#### `DELETE /api/tracks/{id}`
Deletes the metadata row and the file on disk. `204 No Content`, or `404` if unknown.

### Authentication

- A single static token, read from the `MUSIC_STORAGE_TOKEN` environment variable at
  startup. The server refuses to start if it is unset or empty.
- Clients send it as `Authorization: Bearer <token>`.
- Comparison is constant-time.
- Missing / malformed header → `401 Unauthorized`.
  Wrong token → `403 Forbidden`.
- Implemented as one axum middleware layer applied only to the mutating routes.

### Error format

Every error response has the same shape:

```json
{ "error": "human readable message" }
```

Status codes used: `400`, `401`, `403`, `404`, `413`, `415`, `500`.

---

## 6. Web interface

Two pages, both plain HTML served from `static/`, both driven by the public API.
The client sends the auth token only for upload and delete.

Static files are served with `Cache-Control: no-cache`: there is no build step and so no
content hashes in the filenames, and without that header a browser may serve an edited
file from its cache until a hard reload. Revalidation is cheap — `ServeDir`'s `ETag`
turns an unchanged file into a `304`.

### 6.1 Main page — `/` (`index.html`)

- **Header**: app name on the left, a search input on the right.
- **Upload area**: file picker, optional title input, "Upload" button. The upload uses
  the remembered token; without one it refuses and points at the token form.
- **Token area**: a separate form below the upload one — token input, "Remember token"
  button and a "forget token" link — so a token can be stored (and deleting done)
  without uploading anything. The token lives in `localStorage`; a line below the forms
  always states whether one is remembered.
- **Track list**: one row per track showing title, filename, size and upload date,
  plus per-row actions:
  - **Play / Pause** — toggles a single shared `<audio>` element; starting a new
    track stops the previous one; the active row is visually highlighted.
  - **Open** — navigates to the track page.
  - **Download** — saves the file under its original filename.
  - **Delete** — asks for confirmation in-page (not a native `confirm()` dialog),
    then calls the API and removes the row.
- **Search**: filters as you type, debounced ~200 ms, by calling
  `GET /api/tracks?q=…`. Search covers filename and title.
- **Empty state**: a short line of text when there are no tracks, and a distinct one
  when a search returns nothing.

### 6.2 Track page — `/track.html?id={id}` (`track.html`)

- Title as the heading, filename, MIME type, size and upload date below it.
- A single audio player with play/pause and a seek bar.
- A "Download" link saving the file under its original filename.
- A "Delete" button (uses the stored token).
- A "Back" link to the main page.
- Unknown id → a plain "Track not found" message with a back link.

### 6.3 Visual design

Minimalistic and linear-inspired: dark, calm, high information density, restrained
borders, no shadows or gradients beyond a subtle hover state. Spotify-like green as
the single accent colour, used for the active/primary affordances only — the play
button, the currently playing row, focus rings, the upload button and the line saying a
token is remembered. Everything else stays neutral greys.

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | `#08090a` | Page background |
| `--surface` | `#0f1011` | Cards, rows, input backgrounds |
| `--surface-hover` | `#17181a` | Row hover |
| `--border` | `#1f2023` | Hairline borders and separators |
| `--text` | `#e6e6e6` | Primary text |
| `--text-muted` | `#8a8f98` | Secondary text, metadata |
| `--accent` | `#1db954` | Primary actions, active track |
| `--accent-hover` | `#1ed760` | Accent hover |
| `--danger` | `#e5484d` | Delete |

Typography: the system UI font stack, 14 px base, 13 px for metadata.
Layout: single centred column, `max-width: 880px`, responsive down to a phone width
(rows collapse to two lines, actions become icons).
No animation beyond ~120 ms colour transitions.

---

## 7. Configuration

All configuration comes from environment variables; there is no config file.

| Variable | Default | Description |
| --- | --- | --- |
| `MUSIC_STORAGE_TOKEN` | — (**required**) | Auth token for mutating endpoints |
| `MUSIC_STORAGE_DATA_DIR` | `./data` | Where `metadata.csv` and `files/` live |
| `MUSIC_STORAGE_ADDR` | `127.0.0.1:8080` | Bind address |
| `MUSIC_STORAGE_MAX_UPLOAD_MB` | `100` | Maximum upload size in megabytes |

On startup the server creates `DATA_DIR` and `DATA_DIR/files` if missing, and creates
`metadata.csv` with just a header row if missing.

---

## 8. Project layout

```
music-storage/
  Cargo.toml
  SPEC.md
  README.md
  src/
    main.rs        # config, startup, router assembly
    api.rs         # handlers for /api/*
    auth.rs        # bearer-token middleware
    store.rs       # in-memory state + CSV load/save + file I/O
    model.rs       # Track struct, serde/csv derives
  static/
    index.html
    track.html
    app.js         # main page logic
    track.js       # track page logic
    api.js         # tiny fetch wrapper shared by both pages
    style.css
  data/            # created at runtime, git-ignored
```

Target size: on the order of 600–900 lines of Rust and 300–400 lines of JS/CSS.
If the implementation grows well past that, the design has drifted from the goal.

---

## 9. Security notes

Modest but not naive, given this is meant to be self-hosted:

- Uploaded filenames are never used as paths. Files on disk are named `<uuid>.<ext>`,
  where the extension is taken from the allow-list, not from the raw input.
- The original filename is sanitized before being stored in the CSV (strip path
  separators, control characters and NUL; truncate to 255 characters).
- The audio bytes are served with `X-Content-Type-Options: nosniff` and
  `Content-Disposition: inline` — `attachment` on the download endpoint, where the
  stored filename is escaped to ASCII and repeated as an RFC 5987 `filename*`.
- The token is compared in constant time and is never logged.
- Read endpoints are public by design — anyone who can reach the server can list and
  play everything. Put it behind a reverse proxy or a VPN if that is not acceptable.

---

## 10. Acceptance criteria

The project is done when all of the following hold:

1. `cargo run` with `MUSIC_STORAGE_TOKEN` set starts the server; without it, startup
   fails with a clear message.
2. Uploading an `.mp3` through the web interface stores the file and adds one row to
   `metadata.csv`; the row survives a restart.
3. Uploading a `.txt`, `.pdf` or `.mp4` is rejected with `415` and a visible message.
4. `POST /api/tracks` and `DELETE /api/tracks/{id}` return `401` without a token and
   `403` with a wrong one; `GET` endpoints work with no token at all.
5. The main page lists every track and plays and pauses any of them without a page
   reload; only one track plays at a time.
6. Typing in the search box narrows the list by both title and filename.
7. Each row links to `/track.html?id=…`, which shows that track's metadata and its own
   working player.
8. Deleting a track removes it from the list, from `metadata.csv` and from `files/`.
9. Seeking in the player works (range requests are honoured).
10. There is no database, no build step and no runtime dependency beyond the Rust
    binary and the `static/` directory.

---

## 11. Possible follow-ups (not part of this scope)

Listed only so they are not accidentally built now: ID3 tag reading for automatic
titles, editing a title after upload, sorting options, duration display, drag-and-drop
upload, dark/light theme toggle.

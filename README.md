# music-storage

Self-hosted minimal web app and REST API for storing, browsing and playing music files.

No database, no build step, no frontend framework, no user accounts — a single Rust
binary plus the `static/` directory. Metadata lives in one CSV file, audio files sit
next to it on disk. See [SPEC.md](SPEC.md) for the full specification.

## Running

```sh
MUSIC_STORAGE_TOKEN=$(openssl rand -hex 32) cargo run
```

Then open <http://127.0.0.1:8080>. The upload panel is collapsed by default — open it with
the button in the header; whether it is open or closed is remembered in `localStorage`.
Paste the token into it once — that too is remembered, and it is only needed for uploading
and deleting. Until a token is stored, the delete action is not shown at all; "forget
token" hides it again.

While a track is loaded, a bar fixed to the bottom of the main page shows its title and
progress. The track page has its own player: a play/pause button next to a SoundCloud-style waveform
that doubles as the seek bar — click it, or focus it and use the arrow keys, Home and End.
Peaks are computed in the browser with the Web Audio API, so nothing is generated or
stored server-side; the cost is one extra download of the file to decode it.

The interface is available in English and Polish (`EN` / `PL` in the header). The choice
is remembered in `localStorage`; without one, the browser's language decides. Server-side
messages are English, but the interface translates the common API errors by status code.

The server must be started from a directory containing `static/`; that is the repository
root when you use `cargo run`. For a release build:

```sh
cargo build --release
MUSIC_STORAGE_TOKEN=… ./target/release/music-storage
```

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
| --- | --- | --- |
| `MUSIC_STORAGE_TOKEN` | — (**required**) | Auth token for the mutating endpoints |
| `MUSIC_STORAGE_DATA_DIR` | `./data` | Where `metadata.csv` and `files/` live |
| `MUSIC_STORAGE_ADDR` | `127.0.0.1:8080` | Bind address (host and port) |
| `MUSIC_STORAGE_PORT` | — | Port only; overrides the port in `MUSIC_STORAGE_ADDR` |
| `MUSIC_STORAGE_MAX_UPLOAD_MB` | `100` | Maximum upload size in megabytes |

Set `MUSIC_STORAGE_PORT` to change the port while keeping the default bind host, or
`MUSIC_STORAGE_ADDR` to set both at once — for example `MUSIC_STORAGE_ADDR=0.0.0.0:8080`
to accept connections from outside the machine. When both are set, the port from
`MUSIC_STORAGE_PORT` wins and the host from `MUSIC_STORAGE_ADDR` is kept. Port `0` lets
the OS pick a free port; the startup line then reports the one it got.

```sh
MUSIC_STORAGE_TOKEN=… MUSIC_STORAGE_PORT=9000 cargo run
```

Startup fails with a clear message if the token is unset or empty. The data directory,
`files/` and an empty `metadata.csv` are created on first run.

## API

Read endpoints are public; mutating ones need `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/tracks?q=…` | no | All tracks, newest first; `q` filters by title and filename |
| `GET` | `/api/tracks/{id}` | no | One track's metadata |
| `GET` | `/api/tracks/{id}/stream` | no | The audio bytes, with range-request support |
| `POST` | `/api/tracks` | yes | `multipart/form-data` with `file` and optional `title` |
| `DELETE` | `/api/tracks/{id}` | yes | Removes the metadata row and the file |

Errors are always `{"error": "…"}` with status `400`, `401`, `403`, `404`, `413`, `415`
or `500`.

```sh
curl -H "Authorization: Bearer $MUSIC_STORAGE_TOKEN" \
     -F file=@song.mp3 -F title="My Song" \
     http://127.0.0.1:8080/api/tracks

curl http://127.0.0.1:8080/api/tracks?q=jazz
```

Accepted extensions: `.mp3 .wav .flac .ogg .oga .opus .m4a .aac .aiff .aif .wma`.
The part's MIME type must also start with `audio/` (or be `application/ogg` /
`application/octet-stream`). Anything else is rejected with `415`.

## Storage layout

```
<DATA_DIR>/
  metadata.csv     # id,filename,title,content_type,size_bytes,uploaded_at
  files/
    <uuid>.<ext>   # audio files, named by id — never by user input
```

The metadata list is held in memory and the CSV is rewritten atomically after every
change (temp file, fsync, rename).

## Security

Read endpoints are public by design: anyone who can reach the server can list and play
everything. Put it behind a reverse proxy, HTTP basic auth or a VPN if that is not
acceptable. There is no HTTPS termination here — terminate TLS in the proxy.

Uploaded filenames are sanitized and never used as paths, the token is compared in
constant time and never logged, and streams are served with
`Content-Disposition: inline` and `X-Content-Type-Options: nosniff`.

## License

See [LICENSE](LICENSE).

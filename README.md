# plainsong

[![CI](https://github.com/pwittchen/plainsong/actions/workflows/ci.yml/badge.svg)](https://github.com/pwittchen/plainsong/actions/workflows/ci.yml)

Self-hosted minimal web app and REST API for storing, browsing and playing music files.

No database, no build step, no frontend framework, no user accounts — a single Rust
binary plus the `static/` directory. Metadata lives in one CSV file, audio files sit
next to it on disk. See [SPEC.md](SPEC.md) for the full specification.

## Running

```sh
PLAINSONG_TOKEN=$(openssl rand -hex 32) cargo run
```

Then open <http://127.0.0.1:8080>. The upload panel is collapsed by default — open it with
the button in the header; whether it is open or closed is remembered in `localStorage`.
Below the upload form sits a separate token form: paste the token there once and press
"remember token" — it is kept in `localStorage`, so deleting a track needs no upload, and
uploading no longer asks for the token. A line under the forms always says whether a token
is remembered. Until one is, the delete action is not shown at all; "forget token" hides
it again.

While a track is loaded, a bar fixed to the bottom of the main page shows its title and
progress. The track page has its own player: a play/pause button next to a SoundCloud-style waveform
that doubles as the seek bar — click it, or focus it and use the arrow keys, Home and End.
Peaks are computed in the browser with the Web Audio API, so nothing is generated or
stored server-side; the cost is one extra download of the file to decode it.

The interface is available in English and Polish (`EN` / `PL` in the header). The choice
is remembered in `localStorage`; without one, the browser's language decides. Server-side
messages are English, but the interface translates the common API errors by status code.

The server must be started from a directory containing `static/`; that is the repository
root when you use `cargo run`. Those files are served with `Cache-Control: no-cache`, so
an edited page, script or stylesheet shows up on an ordinary reload — no hard reload
needed — while unchanged files still answer with a `304`.

For a release build:

```sh
cargo build --release
PLAINSONG_TOKEN=… ./target/release/plainsong
```

## Docker

The image is built in two stages — a Rust builder and a `debian:bookworm-slim` runtime
holding the binary, `static/` and nothing else worth mentioning (~157 MB). It runs as the
unprivileged user `plainsong` (uid 10001), listens on `0.0.0.0:8080` and keeps its data in
`/data`, which is where you mount a volume.

With Compose, put the token in a `.env` file next to `docker-compose.yml`:

```sh
echo "PLAINSONG_TOKEN=$(openssl rand -hex 32)" > .env
docker compose up -d --build
```

Then open <http://127.0.0.1:8080>. The port is published on the loopback interface only;
remove the `127.0.0.1:` prefix in `docker-compose.yml` to reach it from the network, or
leave it and point a reverse proxy at it. Compose refuses to start without a token, and
so does the server itself. Tracks live in the named volume `plainsong-data`, so
`docker compose down` keeps them and `docker compose down -v` deletes them.

Without Compose:

```sh
docker build -t plainsong .
docker run -d --name plainsong \
  -e PLAINSONG_TOKEN=… \
  -p 127.0.0.1:8080:8080 \
  -v plainsong-data:/data \
  plainsong
```

`.env` is git-ignored. `PLAINSONG_MAX_UPLOAD_MB` can be set the same way (Compose
passes it through, defaulting to 100); do not override `PLAINSONG_DATA_DIR` or
`PLAINSONG_ADDR` — the image sets both, and a bind address other than `0.0.0.0`
makes the container unreachable from outside.

A fresh named volume inherits the image's ownership of `/data`, so it works as is. A bind
mount (`-v ./data:/data`) keeps the host directory's owner instead, so `chown 10001` it
first or the server will fail to write.

The container has a health check that polls `GET /api/tracks` every 30 seconds; it shows
up in `docker ps` and as `.State.Health.Status` in `docker inspect`.

Rebuilds reuse a BuildKit cache for the cargo registry and `target/`, so editing a source
file recompiles that crate and not its dependencies. The build context is restricted to
`Cargo.toml`, `Cargo.lock`, `src/` and `static/`, which keeps `target/` and `data/` out of
it.

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
| --- | --- | --- |
| `PLAINSONG_TOKEN` | — (**required**) | Auth token for the mutating endpoints |
| `PLAINSONG_DATA_DIR` | `./data` | Where `metadata.csv` and `files/` live |
| `PLAINSONG_ADDR` | `127.0.0.1:8080` | Bind address (host and port) |
| `PLAINSONG_PORT` | — | Port only; overrides the port in `PLAINSONG_ADDR` |
| `PLAINSONG_MAX_UPLOAD_MB` | `100` | Maximum upload size in megabytes |

Set `PLAINSONG_PORT` to change the port while keeping the default bind host, or
`PLAINSONG_ADDR` to set both at once — for example `PLAINSONG_ADDR=0.0.0.0:8080`
to accept connections from outside the machine. When both are set, the port from
`PLAINSONG_PORT` wins and the host from `PLAINSONG_ADDR` is kept. Port `0` lets
the OS pick a free port; the startup line then reports the one it got.

```sh
PLAINSONG_TOKEN=… PLAINSONG_PORT=9000 cargo run
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
| `GET` | `/api/tracks/{id}/download` | no | The same bytes, as a file to save under the original filename |
| `POST` | `/api/tracks` | yes | `multipart/form-data` with `file` and optional `title` |
| `DELETE` | `/api/tracks/{id}` | yes | Removes the metadata row and the file |

Errors are always `{"error": "…"}` with status `400`, `401`, `403`, `404`, `413`, `415`
or `500`.

```sh
curl -H "Authorization: Bearer $PLAINSONG_TOKEN" \
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
constant time and never logged, and the audio bytes are served with
`X-Content-Type-Options: nosniff` and `Content-Disposition: inline` (`attachment` on
the download endpoint).

## License

See [LICENSE](LICENSE).

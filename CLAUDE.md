# plainsong

## Git

Commit messages must not contain any AI attribution. Do not add a
`Co-Authored-By: Claude ...` trailer, a "Generated with Claude Code" line, or any
similar co-author or tool credit. The same applies to pull request descriptions.

## Project

[SPEC.md](SPEC.md) is the source of truth. A feature change updates SPEC.md (scope list,
section 6 for the interface, the file layout) and README.md in the same commit.

Backend: Rust, in `src/` (`api.rs`, `auth.rs`, `model.rs`, `store.rs`, `main.rs`). CI runs
`cargo fmt --all -- --check`, `cargo clippy --all-targets --all-features` with
`-D warnings`, and `cargo test --all-features --locked`.

Frontend: plain ES modules in `static/`, with no build step and no framework.

- Three pages: `index.html` (`app.js`), `track.html` (`track.js`) and `playlists.html`
  (`playlists.js`).
- `player.js` owns the shared `<audio>` element and the bottom progress bar that the
  main page and the playlist view both use. Don't copy playback code into a page script.
- Playlists are browser-only: `playlist-store.js` keeps them in `localStorage` under
  `plainsong-playlists`, and the server has no playlist endpoints. Server-side playlists
  and syncing between browsers are explicitly out of scope.
- A track deleted in the interface is passed to `forgetTrack`. Playlists never drop ids
  that the server doesn't know about on their own; those tracks show as unavailable.
- Every modal is built by `modal.js`: a native `<dialog>` opened with `showModal()`.
  Confirmations never use native `confirm()`.
- `playlist-ui.js` holds the playlist modals and the "New playlist" nav button. `nav.js`
  holds the "Add track" and "Token" nav buttons with their modals, and the phone drawer
  that the navigation row and the language switch move into.
- The token is set only in the Token modal. The upload modal has no token field; it only
  says that a valid token is needed.
- Don't use `crypto.randomUUID()` in the browser. It only exists in a secure context,
  and instances are often reached over plain HTTP.
- Every UI string goes in `i18n.js` in both `en` and `pl`.

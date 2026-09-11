// Playlists, kept in this browser's localStorage only — the server knows nothing about
// them. Every call reads the stored list afresh, so two open tabs do not overwrite each
// other with a stale copy.

const PLAYLISTS_KEY = "plainsong-playlists";

export const NAME_MAX = 100;

/** A playlist is `{ id, name, trackIds }`; the order of `trackIds` is the play order. */
function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYLISTS_KEY));
    // Anything malformed (hand-edited storage, say) is dropped rather than trusted.
    return Array.isArray(stored)
      ? stored.filter(
          (playlist) =>
            playlist &&
            typeof playlist.id === "string" &&
            typeof playlist.name === "string" &&
            Array.isArray(playlist.trackIds),
        )
      : [];
  } catch {
    return [];
  }
}

function save(playlists) {
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  } catch {
    /* storage disabled or full: the change is not kept */
  }
}

/** Trimmed, without control characters, capped — the same treatment a track title gets. */
export function cleanName(name) {
  return name.replace(/\p{Cc}/gu, "").trim().slice(0, NAME_MAX);
}

export function listPlaylists() {
  return load();
}

export function getPlaylist(id) {
  return load().find((playlist) => playlist.id === id) ?? null;
}

export function playlistsWith(trackId) {
  return load().filter((playlist) => playlist.trackIds.includes(trackId));
}

export function createPlaylist(name) {
  // Not crypto.randomUUID(): that only exists in a secure context, and a self-hosted
  // instance is often reached over plain HTTP on the local network.
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const playlist = { id, name: cleanName(name), trackIds: [] };
  save([...load(), playlist]);
  return playlist;
}

export function deletePlaylist(id) {
  save(load().filter((playlist) => playlist.id !== id));
}

/** Put a track on exactly the playlists in `ids`: appended where new, removed elsewhere. */
export function setTrackPlaylists(trackId, ids) {
  save(
    load().map((playlist) => {
      const has = playlist.trackIds.includes(trackId);
      if (ids.has(playlist.id) && !has) {
        return { ...playlist, trackIds: [...playlist.trackIds, trackId] };
      }
      if (!ids.has(playlist.id) && has) {
        return { ...playlist, trackIds: playlist.trackIds.filter((other) => other !== trackId) };
      }
      return playlist;
    }),
  );
}

/**
 * Reorder a playlist. Ids it does not hold are ignored, and any it holds that `order`
 * leaves out keep their relative order at the end, so nothing is lost by accident.
 * Returns the updated playlist.
 */
export function setOrder(id, order) {
  let updated = null;
  save(
    load().map((playlist) => {
      if (playlist.id !== id) return playlist;
      const kept = order.filter((trackId) => playlist.trackIds.includes(trackId));
      const rest = playlist.trackIds.filter((trackId) => !kept.includes(trackId));
      updated = { ...playlist, trackIds: [...kept, ...rest] };
      return updated;
    }),
  );
  return updated;
}

export function removeFromPlaylist(id, trackId) {
  save(
    load().map((playlist) =>
      playlist.id === id
        ? { ...playlist, trackIds: playlist.trackIds.filter((other) => other !== trackId) }
        : playlist,
    ),
  );
}

/** A deleted track leaves every playlist with it. */
export function forgetTrack(trackId) {
  const playlists = load();
  if (!playlists.some((playlist) => playlist.trackIds.includes(trackId))) return;
  save(
    playlists.map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.filter((other) => other !== trackId),
    })),
  );
}

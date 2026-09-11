// The shared <audio> element and the now-playing bar fixed to the bottom of the list
// pages — the main page and a single playlist. One track plays at a time.

import { formatTime, streamUrl } from "./api.js";
import { t } from "./i18n.js";

/**
 * Wire up `#player` and `#player-bar`. `onChange` redraws whatever shows which track
 * is playing, `onEnded` gets the track that has just finished, `onError` a message.
 */
export function mountListPlayer({ onChange, onEnded = () => {}, onError }) {
  const [audio, bar, barTitle, barFill, barTime] = [
    "player",
    "player-bar",
    "player-bar-title",
    "player-bar-fill",
    "player-bar-time",
  ].map((id) => document.getElementById(id));

  // The track the player is loaded with, held by reference so the bar keeps its title
  // even when a search or an edit takes that track out of the list.
  let playing = null;

  /** The fixed bar at the bottom: what is playing and how far in. */
  function renderProgress() {
    bar.hidden = playing === null;
    if (playing === null) return;

    const { currentTime, duration } = audio;
    const ratio = Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0;
    barTitle.textContent = playing.title;
    barFill.style.width = `${(ratio * 100).toFixed(2)}%`;
    barTime.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  }

  // A frame loop keeps the fill smooth; it only runs while something is actually playing.
  let frame = null;
  function tick() {
    renderProgress();
    frame = requestAnimationFrame(tick);
  }

  audio.addEventListener("play", () => {
    if (frame === null) tick();
    onChange();
  });
  for (const event of ["pause", "ended"]) {
    audio.addEventListener(event, () => {
      cancelAnimationFrame(frame);
      frame = null;
      renderProgress();
      onChange();
    });
  }
  audio.addEventListener("ended", () => onEnded(playing));
  audio.addEventListener("loadedmetadata", renderProgress);
  audio.addEventListener("error", () => {
    if (playing !== null) onError(t("playbackFailed"));
  });

  function start() {
    audio.play().catch((e) => onError(t("cannotPlay", { message: e.message })));
  }

  return {
    /** The track the player is loaded with, or null. */
    current: () => playing,

    /** Whether this track is the loaded one, playing or paused. */
    isLoaded: (id) => playing !== null && playing.id === id,

    /** Whether this track is the loaded one and it is not paused. */
    isPlaying: (id) => playing !== null && playing.id === id && !audio.paused,

    /** Load a track from its start and play it. */
    play(track) {
      playing = track;
      audio.src = streamUrl(track.id);
      start();
    },

    /** A row's play/pause button: pause the playing track, resume or start any other. */
    toggle(track) {
      if (playing === null || playing.id !== track.id) return this.play(track);
      if (audio.paused) start();
      else audio.pause();
    },

    stop() {
      audio.pause();
      playing = null;
      audio.removeAttribute("src");
      audio.load();
      renderProgress();
    },
  };
}

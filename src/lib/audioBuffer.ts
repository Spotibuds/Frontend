import type { AudioState } from "./audioState";
import type { Song } from "./api";

export function bufferedEnd(audio: HTMLMediaElement): number {
  for (let i = 0; i < audio.buffered.length; i++) {
    if (
      audio.buffered.start(i) <= audio.currentTime + 0.05 &&
      audio.buffered.end(i) >= audio.currentTime
    )
      return audio.buffered.end(i);
  }
  return audio.currentTime;
}

export function nextSongToPreload(state: AudioState): Song | null {
  if (state.repeatMode === "one") return null;
  if (state.queue.length) return state.queue[0];
  // Shuffle chooses on advancement; guessing here would download the wrong song.
  if (state.shuffleMode) return null;
  return (
    state.playlist[state.currentIndex + 1] ||
    (state.repeatMode === "all" ? state.playlist[0] : null) ||
    null
  );
}

export function permitsPreload(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType || "");
}

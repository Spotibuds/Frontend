import type { Song } from "./api";
export interface AudioState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  previousVolume: number;
  isLoading: boolean;
  isSeeking: boolean;
  playlist: Song[];
  currentIndex: number;
  shuffleMode: boolean;
  repeatMode: "off" | "one" | "all";
  queue: Song[];
  playHistory: Song[];
  error: string | null;
  playbackRevision: number;
}
export const initialState: AudioState = {
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isMuted: false,
  previousVolume: 0.7,
  isLoading: false,
  isSeeking: false,
  playlist: [],
  currentIndex: -1,
  shuffleMode: false,
  repeatMode: "off",
  queue: [],
  playHistory: [],
  error: null,
  playbackRevision: 0,
};
export type AudioAction =
  | { type: "PATCH"; payload: Partial<AudioState> }
  | { type: "PLAYLIST"; songs: Song[]; index: number }
  | { type: "NEXT" | "PREVIOUS" | "RESET" | "ENDED" };
export function audioReducer(state: AudioState, action: AudioAction): AudioState {
  if (action.type === "RESET")
    return {
      ...initialState,
      playbackRevision: state.playbackRevision + 1,
      volume: state.volume,
      isMuted: state.isMuted,
    };
  if (action.type === "PATCH") return { ...state, ...action.payload };
  if (action.type === "PLAYLIST")
    return {
      ...state,
      playbackRevision: state.playbackRevision + 1,
      playlist: action.songs,
      currentIndex: action.index,
      currentSong: action.songs[action.index] || null,
      currentTime: 0,
      duration: 0,
      isPlaying: Boolean(action.songs[action.index]),
      queue: [],
      playHistory: [],
      error: null,
    };
  if (action.type === "PREVIOUS") {
    if (state.currentTime > 3) return { ...state, currentTime: 0 };
    const previous = state.playHistory.at(-1);
    if (previous)
      return {
        ...state,
        playbackRevision: state.playbackRevision + 1,
        currentSong: previous,
        playHistory: state.playHistory.slice(0, -1),
        currentIndex: Math.max(
          -1,
          state.playlist.findIndex(song => song.id === previous.id)
        ),
        currentTime: 0,
        duration: 0,
        error: null,
      };
    const index = Math.max(0, state.currentIndex - 1);
    return {
      ...state,
      playbackRevision: state.playbackRevision + 1,
      currentIndex: index,
      currentSong: state.playlist[index] || state.currentSong,
      currentTime: 0,
      duration: 0,
    };
  }
  const history = state.currentSong
    ? [...state.playHistory, state.currentSong].slice(-50)
    : state.playHistory;
  if (state.queue.length)
    return {
      ...state,
      playbackRevision: state.playbackRevision + 1,
      currentSong: state.queue[0],
      queue: state.queue.slice(1),
      playHistory: history,
      currentTime: 0,
      duration: 0,
      error: null,
    };
  let index = state.currentIndex + 1;
  if (state.shuffleMode && state.playlist.length > 1) {
    const choices = state.playlist
      .map((_, i) => i)
      .filter(
        i =>
          i !== state.currentIndex &&
          (state.repeatMode === "all" || !history.some(song => song.id === state.playlist[i].id))
      );
    index = choices.length
      ? choices[Math.floor(Math.random() * choices.length)]
      : state.playlist.length;
  }
  if (index >= state.playlist.length && state.repeatMode === "all") index = 0;
  if (!state.playlist[index])
    return { ...state, isPlaying: false, isLoading: false, currentTime: state.duration };
  return {
    ...state,
    playbackRevision: state.playbackRevision + 1,
    currentIndex: index,
    currentSong: state.playlist[index],
    playHistory: history,
    currentTime: 0,
    duration: 0,
    error: null,
  };
}

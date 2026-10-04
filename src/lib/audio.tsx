"use client";
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  ReactNode,
} from "react";
import { Song, API_CONFIG, userApi } from "./api";
import { audioReducer, initialState, AudioState } from "./audioState";
import { bufferedEnd, nextSongToPreload, permitsPreload } from "./audioBuffer";
import { getSessionUser, SESSION_EVENT } from "./session";
interface AudioContextType {
  state: AudioState;
  playSong: (song: Song, songs?: Song[]) => void;
  playPlaylist: (songs: Song[], startIndex?: number) => void;
  togglePlayPause: () => void;
  nextSong: () => void;
  previousSong: () => void;
  seekTo: (time: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: "off" | "one" | "all") => void;
  addToQueue: (songs: Song | Song[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  formatTime: (seconds: number) => string;
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  isSeeking: boolean;
  playlist: Song[];
  queue: Song[];
  shuffleMode: boolean;
  repeatMode: "off" | "one" | "all";
  playHistory: Song[];
}
const AudioContext = createContext<AudioContextType | undefined>(undefined);
const playbackError =
  "Playback could not start. Check the local media service and press Play to retry.";
const mediaUrl = (url: string) =>
  url.startsWith(`${API_CONFIG.MUSIC_API}/api/media/`)
    ? url
    : `${API_CONFIG.MUSIC_API}/api/media/audio?url=${encodeURIComponent(url)}`;
export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(audioReducer, initialState);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const players = useRef<Array<HTMLAudioElement | null>>([null, null]);
  const activeSlot = useRef(0);
  const warmed = useRef<{ id: string; url: string } | null>(null);
  const clearPlayer = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);
  const owner = useRef<string | null>(null);
  const listeningSeconds = useRef(0);
  const historyAdded = useRef(false);
  const historyAttempts = useRef(0);
  const nextHistoryAttempt = useRef(30);
  useEffect(() => {
    const restore = () => {
      const id = getSessionUser()?.id || null;
      if (owner.current === id) return;
      warmed.current = null;
      players.current.forEach(clearPlayer);
      if (owner.current) {
        try {
          localStorage.removeItem(`audioState:${owner.current}`);
        } catch {
          /* Teardown must always reset memory. */
        }
      }
      owner.current = id;
      dispatch({ type: "RESET" });
      if (id) {
        try {
          const saved = JSON.parse(localStorage.getItem(`audioState:${id}`) || "null");
          if (saved)
            dispatch({
              type: "PATCH",
              payload: {
                ...saved,
                isPlaying: false,
                isLoading: false,
                isSeeking: false,
                bufferedTime: 0,
                error: null,
              },
            });
        } catch {
          try {
            localStorage.removeItem(`audioState:${id}`);
          } catch {
            /* Invalid saved state is ignored. */
          }
        }
      }
    };
    restore();
    window.addEventListener(SESSION_EVENT, restore);
    return () => window.removeEventListener(SESSION_EVENT, restore);
  }, [clearPlayer]);
  useEffect(() => {
    const mountedPlayers = [...players.current];
    return () => mountedPlayers.forEach(clearPlayer);
  }, [clearPlayer]);
  useEffect(() => {
    if (owner.current) {
      try {
        localStorage.setItem(
          `audioState:${owner.current}`,
          JSON.stringify({
            currentSong: state.currentSong,
            playlist: state.playlist,
            queue: state.queue,
            currentIndex: state.currentIndex,
            shuffleMode: state.shuffleMode,
            repeatMode: state.repeatMode,
            volume: state.volume,
            isMuted: state.isMuted,
            playHistory: state.playHistory,
          })
        );
      } catch {
        /* Playback remains available without persistence. */
      }
    }
  }, [
    state.currentSong,
    state.playlist,
    state.queue,
    state.currentIndex,
    state.shuffleMode,
    state.repeatMode,
    state.volume,
    state.isMuted,
    state.playHistory,
  ]);
  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!latest.current.currentSong?.fileUrl?.trim()) {
      if (latest.current.currentSong)
        dispatch({
          type: "PATCH",
          payload: { isPlaying: false, isLoading: false, error: playbackError },
        });
      return;
    }
    if (audio && latest.current.isPlaying) {
      const revision = latest.current.playbackRevision;
      void audio.play().catch(cause => {
        // Pausing or replacing a source rejects its pending play promise. It must
        // not stop a newer track or undo a deliberate pause.
        if (
          cause?.name === "AbortError" ||
          audioRef.current !== audio ||
          latest.current.playbackRevision !== revision ||
          !latest.current.isPlaying
        )
          return;
        dispatch({
          type: "PATCH",
          payload: {
            isPlaying: false,
            isLoading: false,
            error: playbackError,
          },
        });
      });
    }
  }, []);
  useEffect(() => {
    let audio = audioRef.current;
    if (!audio) return;
    const url = state.currentSong?.fileUrl;
    listeningSeconds.current = 0;
    historyAdded.current = false;
    historyAttempts.current = 0;
    nextHistoryAttempt.current = 30;
    if (!url?.trim()) {
      warmed.current = null;
      players.current.forEach(clearPlayer);
      dispatch({
        type: "PATCH",
        payload: {
          isPlaying: false,
          isLoading: false,
          ...(latest.current.currentSong ? { error: playbackError } : {}),
        },
      });
      return;
    }
    // Public playback is always mediated by Music's catalogue allowlist.
    const target = mediaUrl(url);
    const standbySlot = 1 - activeSlot.current;
    const standby = players.current[standbySlot];
    const prepared = warmed.current;
    if (
      prepared &&
      prepared.id === state.currentSong?.id &&
      prepared.url === target &&
      standby?.getAttribute("src") === target
    ) {
      // Promote the same media element so its downloaded bytes are reused.
      const previous = audio;
      activeSlot.current = standbySlot;
      audioRef.current = audio = standby;
      warmed.current = null;
      clearPlayer(previous);
      dispatch({
        type: "PATCH",
        payload: {
          bufferedTime: bufferedEnd(audio),
          duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        },
      });
    } else {
      audio.pause();
      audio.preload = latest.current.isPlaying ? "auto" : "metadata";
      audio.src = target;
      audio.load();
    }
    audio.preload = latest.current.isPlaying ? "auto" : "metadata";
    audio.volume = latest.current.volume;
    audio.muted = latest.current.isMuted;
    tryPlay();
  }, [
    state.currentSong?.id,
    state.currentSong?.fileUrl,
    state.playbackRevision,
    tryPlay,
    clearPlayer,
  ]);
  const next = nextSongToPreload(state);
  const enoughBuffered = state.bufferedTime - state.currentTime >= 10;
  useEffect(() => {
    const standby = players.current[1 - activeSlot.current];
    if (!standby) return;
    if (
      !next?.fileUrl?.trim() ||
      next.id === latest.current.currentSong?.id ||
      !state.isPlaying ||
      state.isLoading ||
      !permitsPreload()
    ) {
      if (warmed.current) {
        warmed.current = null;
        clearPlayer(standby);
      }
      return;
    }
    const url = mediaUrl(next.fileUrl);
    if (warmed.current?.id === next.id && warmed.current.url === url) return;
    clearPlayer(standby);
    warmed.current = null;
    // The last seconds of a fully buffered song naturally fall below the
    // threshold. Keep an existing warmup; only use this gate to start a new one.
    if (!enoughBuffered) return;
    warmed.current = { id: next.id, url };
    standby.preload = "metadata";
    standby.muted = true;
    standby.src = url;
    standby.load();
  }, [
    next?.id,
    next?.fileUrl,
    state.currentSong?.id,
    state.isPlaying,
    state.isLoading,
    enoughBuffered,
    clearPlayer,
  ]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.volume;
    audio.muted = state.isMuted;
  }, [state.volume, state.isMuted]);
  useEffect(() => {
    if (state.isPlaying) tryPlay();
    else audioRef.current?.pause();
  }, [state.isPlaying, tryPlay]);
  useEffect(() => {
    const timer = setInterval(() => {
      const audio = audioRef.current;
      const song = latest.current.currentSong;
      if (
        !audio ||
        audio.paused ||
        audio.seeking ||
        !song?.fileUrl?.trim() ||
        !latest.current.isPlaying ||
        !owner.current
      )
        return;
      listeningSeconds.current++;
      if (
        listeningSeconds.current >= nextHistoryAttempt.current &&
        !historyAdded.current &&
        historyAttempts.current < 3
      ) {
        historyAdded.current = true;
        historyAttempts.current++;
        nextHistoryAttempt.current = listeningSeconds.current + 30;
        void userApi
          .addToListeningHistory(owner.current, {
            songId: song.id,
            songTitle: song.title,
            artist: song.artists.map(artist => artist.name).join(", "),
            coverUrl: song.coverUrl,
            duration: listeningSeconds.current,
          })
          .catch(() => {
            historyAdded.current = false;
            dispatch({
              type: "PATCH",
              payload: {
                error:
                  "Listening history could not be saved. The local User service may be unavailable.",
              },
            });
          });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const user = getSessionUser();
    const song = state.currentSong;
    if (!user) return;
    if (!song?.fileUrl?.trim() || !state.isPlaying) {
      void userApi.clearNowPlaying(user.id).catch(() => undefined);
      return;
    }
    let inFlight = false;
    let cancelled = false;
    const publish = async () => {
      if (inFlight || cancelled || owner.current !== user.id) return;
      inFlight = true;
      try {
        await userApi.setNowPlaying({
          identityUserId: user.id,
          songId: song.id,
          songTitle: song.title,
          artist: song.artists.map(artist => artist.name).join(", "),
          coverUrl: song.coverUrl,
          positionSec: Math.floor(audioRef.current?.currentTime || 0),
          isPlaying: true,
        });
      } catch {
        if (!cancelled)
          dispatch({
            type: "PATCH",
            payload: {
              error: "Now-playing status could not be updated. Check the local User service.",
            },
          });
      } finally {
        inFlight = false;
      }
    };
    void publish();
    const timer = setInterval(() => void publish(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.currentSong, state.isPlaying]);
  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration));
    dispatch({
      type: "PATCH",
      payload: { currentTime: audio.currentTime, bufferedTime: bufferedEnd(audio) },
    });
  };
  const previousSong = () => {
    if ((audioRef.current?.currentTime || 0) > 3) seekTo(0);
    else dispatch({ type: "PREVIOUS" });
  };
  const patch = (payload: Partial<AudioState>) => dispatch({ type: "PATCH", payload });
  const value: AudioContextType = {
    state,
    ...state,
    playSong: (song, songs = [song]) =>
      dispatch({
        type: "PLAYLIST",
        songs,
        index: Math.max(
          0,
          songs.findIndex(item => item.id === song.id)
        ),
      }),
    playPlaylist: (songs, index = 0) => dispatch({ type: "PLAYLIST", songs, index }),
    togglePlayPause: () => patch({ isPlaying: !state.isPlaying, isLoading: false, error: null }),
    nextSong: () => dispatch({ type: "NEXT" }),
    previousSong,
    seekTo,
    skipForward: (seconds = 10) => seekTo(state.currentTime + seconds),
    skipBackward: (seconds = 10) => seekTo(state.currentTime - seconds),
    setVolume: volume => patch({ volume: Math.max(0, Math.min(1, volume)), isMuted: false }),
    toggleMute: () => patch({ isMuted: !state.isMuted }),
    setShuffle: shuffleMode => patch({ shuffleMode }),
    setRepeat: repeatMode => patch({ repeatMode }),
    addToQueue: songs =>
      patch({ queue: [...state.queue, ...(Array.isArray(songs) ? songs : [songs])].slice(0, 500) }),
    removeFromQueue: index => patch({ queue: state.queue.filter((_, i) => i !== index) }),
    clearQueue: () => patch({ queue: [] }),
    formatTime: seconds => {
      const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
    },
  };
  return (
    <AudioContext.Provider value={value}>
      {children}
      {[0, 1].map(slot => (
        <audio
          key={slot}
          ref={element => {
            players.current[slot] = element;
            if (slot === activeSlot.current) audioRef.current = element;
          }}
          preload="metadata"
          onTimeUpdate={event => {
            const audio = event.currentTarget;
            if (audio !== audioRef.current) return;
            patch({ currentTime: audio.currentTime, bufferedTime: bufferedEnd(audio) });
          }}
          onProgress={event => {
            if (event.currentTarget === audioRef.current)
              patch({ bufferedTime: bufferedEnd(event.currentTarget) });
          }}
          onDurationChange={event => {
            if (event.currentTarget === audioRef.current)
              patch({
                duration: Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : 0,
              });
          }}
          onCanPlay={event => {
            if (event.currentTarget !== audioRef.current) return;
            patch({ isLoading: false });
            tryPlay();
          }}
          onLoadStart={event => {
            if (event.currentTarget === audioRef.current)
              patch({ isLoading: latest.current.isPlaying });
          }}
          onWaiting={event => {
            if (event.currentTarget === audioRef.current)
              patch({ isLoading: latest.current.isPlaying });
          }}
          onPlaying={event => {
            if (event.currentTarget === audioRef.current) patch({ isLoading: false });
          }}
          onSeeking={event => {
            if (event.currentTarget === audioRef.current) patch({ isSeeking: true });
          }}
          onSeeked={event => {
            if (event.currentTarget === audioRef.current)
              patch({
                isSeeking: false,
                currentTime: event.currentTarget.currentTime,
                bufferedTime: bufferedEnd(event.currentTarget),
              });
          }}
          onError={event => {
            if (event.currentTarget !== audioRef.current) {
              warmed.current = null;
              clearPlayer(event.currentTarget);
              return;
            }
            patch({
              isPlaying: false,
              isLoading: false,
              error: "Audio could not be loaded. Check the local Music service and retry.",
            });
          }}
          onEnded={event => {
            if (event.currentTarget !== audioRef.current) return;
            if (latest.current.repeatMode === "one") {
              seekTo(0);
              tryPlay();
            } else dispatch({ type: "ENDED" });
          }}
        />
      ))}
    </AudioContext.Provider>
  );
}
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within an AudioProvider");
  return context;
}

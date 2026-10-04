"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  BackwardIcon,
  ForwardIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  QueueListIcon,
  XMarkIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { Shuffle, Repeat, Repeat1 } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import MusicImage from "@/components/ui/MusicImage";
import FavoriteButton from "@/components/FavoriteButton";
import ArtistLinks from "@/components/ArtistLinks";
import { useAudio } from "@/lib/audio";
import { processArtists, safeString } from "@/lib/api";

export default function MusicPlayer() {
  const footer = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = footer.current;
    if (!element) return;
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("--music-player-height");
    const measure = () =>
      style.setProperty(
        "--music-player-height",
        `${Math.ceil(element.getBoundingClientRect().height)}px`
      );
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (previous) style.setProperty("--music-player-height", previous);
      else style.removeProperty("--music-player-height");
    };
  }, []);
  const audio = useAudio();
  const { state, formatTime } = audio;
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const song = state.currentSong;
  const title = safeString(song?.title) || "Nothing playing yet";
  const artist = song ? processArtists(song.artists).join(", ") : "Choose a song to get started";
  const cycleRepeat = () =>
    audio.setRepeat(
      state.repeatMode === "off" ? "all" : state.repeatMode === "all" ? "one" : "off"
    );
  const shuffle = (
    <button
      type="button"
      className={`icon-button ${state.shuffleMode ? "text-purple-400" : ""}`}
      onClick={() => audio.setShuffle(!state.shuffleMode)}
      aria-label="Shuffle"
      aria-pressed={state.shuffleMode}
      title="Shuffle"
    >
      <Shuffle className="h-4 w-4" />
    </button>
  );
  const repeat = (
    <button
      type="button"
      className={`icon-button ${state.repeatMode !== "off" ? "text-purple-400" : ""}`}
      onClick={cycleRepeat}
      aria-label={`Repeat ${state.repeatMode}`}
      aria-pressed={state.repeatMode !== "off"}
      title={`Repeat: ${state.repeatMode}`}
    >
      {state.repeatMode === "one" ? (
        <Repeat1 className="h-4 w-4" />
      ) : (
        <Repeat className="h-4 w-4" />
      )}
    </button>
  );
  const transport = (
    <>
      <button
        type="button"
        className="icon-button"
        disabled={!song}
        onClick={audio.previousSong}
        aria-label="Previous song"
      >
        <BackwardIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-950 hover:bg-white"
        disabled={!song}
        onClick={audio.togglePlayPause}
        aria-label={state.isPlaying ? "Pause playback" : "Play playback"}
        aria-busy={state.isLoading}
      >
        {state.isLoading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
        ) : state.isPlaying ? (
          <PauseIcon className="h-6 w-6" />
        ) : (
          <PlayIcon className="h-6 w-6" />
        )}
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!song}
        onClick={audio.nextSong}
        aria-label="Next song"
      >
        <ForwardIcon className="h-5 w-5" />
      </button>
    </>
  );
  const played = state.duration ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;
  const buffered = state.duration
    ? Math.max(played, Math.min(100, (state.bufferedTime / state.duration) * 100))
    : 0;
  const seek = (label: string) => (
    <input
      type="range"
      aria-label={label}
      aria-valuetext={`${formatTime(state.currentTime)} of ${formatTime(state.duration)}`}
      min={0}
      max={state.duration || 0}
      step={0.1}
      value={Math.min(state.currentTime, state.duration || 0)}
      disabled={!state.duration}
      onChange={e => audio.seekTo(Number(e.target.value))}
      className="playback-line min-w-0 flex-1"
      style={{ "--played": `${played}%`, "--buffered": `${buffered}%` } as CSSProperties}
    />
  );
  const volume = (
    <>
      <button
        type="button"
        className="icon-button"
        onClick={audio.toggleMute}
        aria-label={state.isMuted ? "Unmute audio" : "Mute audio"}
        aria-pressed={state.isMuted}
      >
        {state.isMuted || state.volume === 0 ? (
          <SpeakerXMarkIcon className="h-5 w-5" />
        ) : (
          <SpeakerWaveIcon className="h-5 w-5" />
        )}
      </button>
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={state.volume}
        onChange={e => audio.setVolume(Number(e.target.value))}
        className="w-24 min-w-0"
      />
    </>
  );
  const cover = (large = false) => (
    <div
      className={`${large ? "mx-auto aspect-square w-full max-w-[260px] rounded-xl" : "h-12 w-12 rounded-md"} shrink-0 overflow-hidden bg-gray-700`}
    >
      {song?.coverUrl ? (
        <MusicImage src={song.coverUrl} alt={title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <MusicalNoteIcon
            className={large ? "h-20 w-20 text-gray-400" : "h-6 w-6 text-gray-400"}
          />
        </div>
      )}
    </div>
  );
  return (
    <>
      <footer
        ref={footer}
        className="player-bar fixed inset-x-0 bottom-0 z-[50]"
        aria-label="Music player"
      >
        <div className="player-grid">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label="Open music player"
                className="shrink-0 rounded-md"
              >
                {cover()}
              </button>
              <div className="min-w-0">
                {song?.album?.id ? (
                  <Link
                    href={`/album/${song.album.id}`}
                    title={`Open album: ${song.album.title}`}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {title}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="block max-w-full truncate text-left text-sm font-semibold"
                    aria-label="Open track details"
                  >
                    {title}
                  </button>
                )}
                <p className="mt-1 truncate text-xs text-gray-400">
                  <ArtistLinks artists={song?.artists} fallback={artist} />
                </p>
              </div>
            </div>
            {song && (
              <span className="hidden sm:block">
                <FavoriteButton songId={song.id} title={title} />
              </span>
            )}
          </div>
          <div className="player-transport">
            <div className="player-controls">
              <span className="hidden md:block">{shuffle}</span>
              {transport}
              <span className="hidden md:block">{repeat}</span>
            </div>
            <div className="player-seek">
              <span>{formatTime(state.currentTime)}</span>
              {seek("Playback position")}
              <span>{formatTime(state.duration)}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="icon-button"
              onClick={() => setQueueOpen(true)}
              aria-label={`Show queue (${state.queue.length})`}
              title="Queue"
            >
              <QueueListIcon className="h-5 w-5" />
              <span className="text-xs tabular-nums">{state.queue.length || ""}</span>
            </button>
            {volume}
          </div>
        </div>
      </footer>
      <Dialog open={expanded} onClose={() => setExpanded(false)} title="Now playing">
        {cover(true)}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-gray-400">
              <ArtistLinks
                artists={song?.artists}
                fallback={artist}
                onNavigate={() => setExpanded(false)}
              />
            </p>
            {song?.album?.id && (
              <Link
                href={`/album/${song.album.id}`}
                onClick={() => setExpanded(false)}
                className="mt-2 inline-flex min-h-11 items-center text-sm text-purple-300 hover:underline"
              >
                View album: {song.album.title}
              </Link>
            )}
          </div>
          {song && <FavoriteButton songId={song.id} title={title} />}
        </div>
        <div className="mt-5 flex items-center gap-3">{seek("Playback position")}</div>
        <div className="flex justify-between text-xs tabular-nums text-gray-400">
          <span>{formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
        <div className="player-controls my-5">
          {shuffle}
          {transport}
          {repeat}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center">{volume}</div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
            onClick={() => {
              setExpanded(false);
              setQueueOpen(true);
            }}
          >
            <QueueListIcon className="h-5 w-5" />
            Queue ({state.queue.length})
          </button>
        </div>
        {state.error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {state.error}
          </p>
        )}
      </Dialog>
      <Dialog open={queueOpen} onClose={() => setQueueOpen(false)} title="Up next">
        {state.queue.length ? (
          <>
            <div className="mb-3 flex justify-between text-sm text-gray-400">
              <span>{state.queue.length} songs queued</span>
              <button
                type="button"
                onClick={() => {
                  audio.clearQueue();
                  setNotice("Queue cleared. Your current song keeps playing.");
                }}
                className="text-gray-200 underline"
              >
                Clear queue
              </button>
            </div>
            <ol className="max-h-[55dvh] overflow-y-auto">
              {state.queue.map((item, index) => (
                <li key={`${item.id}-${index}`} className="track-row">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => audio.playSong(item, [item, ...state.queue.slice(index + 1)])}
                    aria-label={`Play ${item.title} next`}
                  >
                    <span className="w-5 text-xs tabular-nums text-gray-400">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{item.title}</span>
                      <span className="block truncate text-xs text-gray-400">
                        {processArtists(item.artists).join(", ")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${item.title} from queue`}
                    onClick={() => audio.removeFromQueue(index)}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="py-8 text-center">
            <QueueListIcon className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <p>Your queue is empty</p>
            <p className="mt-2 text-sm text-gray-400">
              Use “Add to queue” on a song to choose what plays next.
            </p>
          </div>
        )}
        {notice && (
          <p role="status" className="mt-2 text-sm text-gray-400">
            {notice}
          </p>
        )}
      </Dialog>
    </>
  );
}

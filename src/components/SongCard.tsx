"use client";
import { useState } from "react";
import { PlayIcon, PauseIcon, PlusIcon, QueueListIcon } from "@heroicons/react/24/outline";
import MusicImage from "@/components/ui/MusicImage";
import Dialog from "@/components/ui/Dialog";
import FavoriteButton from "@/components/FavoriteButton";
import AddToPlaylist from "@/components/AddToPlaylist";
import { Song, safeString, processArtists, identityApi } from "@/lib/api";
import { useAudio } from "@/lib/audio";

interface SongCardProps {
  song: Song;
  showDuration?: boolean;
  showAddToPlaylist?: boolean;
  showAddToQueue?: boolean;
  className?: string;
  index?: number;
  onClick?: () => void;
}
export default function SongCard({
  song,
  showDuration = true,
  showAddToPlaylist = true,
  showAddToQueue = true,
  className = "",
  index,
  onClick,
}: SongCardProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const audio = useAudio();
  const currentUser = identityApi.getCurrentUser();
  const current = audio.currentSong?.id === song.id;
  const play = () => {
    if (onClick) onClick();
    else if (current) audio.togglePlayPause();
    else audio.playSong(song);
  };
  const title = safeString(song.title);
  return (
    <>
      <div className={`track-row group ${className}`} data-current={current}>
        <button
          type="button"
          onClick={play}
          className="icon-button shrink-0"
          aria-label={`${current && audio.isPlaying ? "Pause" : "Play"} ${title}`}
        >
          {current && audio.isPlaying ? (
            <PauseIcon className="h-5 w-5 text-purple-400" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
        </button>
        {index !== undefined && (
          <span className="hidden w-5 text-xs tabular-nums text-gray-400 lg:block">
            {index + 1}
          </span>
        )}
        <MusicImage
          src={song.coverUrl}
          alt={title}
          fallbackText={title}
          size="medium"
          type="square"
          className="h-11 w-11 shrink-0 rounded-md"
        />
        <button
          type="button"
          onClick={play}
          className="min-w-0 flex-1 text-left"
          aria-label={`Listen to ${title}`}
        >
          <span
            className={`block truncate text-sm font-medium ${current ? "text-purple-400" : "text-white"}`}
          >
            {title}
          </span>
          <span className="mt-1 block truncate text-xs text-gray-400">
            {processArtists(song.artists).join(", ")}
          </span>
        </button>
        {currentUser && <FavoriteButton songId={song.id} title={title} />}
        {showAddToQueue && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Add ${title} to queue`}
            title="Add to queue"
            onClick={() => {
              audio.addToQueue(song);
              setNotice(`${title} added to queue`);
            }}
          >
            <QueueListIcon className="h-5 w-5" />
          </button>
        )}
        {showAddToPlaylist && currentUser && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Add ${title} to playlist`}
            title="Add to playlist"
            onClick={() => setOpen(true)}
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        )}
        {showDuration && (
          <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-gray-400 md:block">
            {audio.formatTime(song.durationSec)}
          </span>
        )}
      </div>
      {notice && (
        <p role="status" className="px-3 text-xs text-purple-300">
          {notice}
        </p>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add to playlist">
        <p className="mb-4 truncate text-sm text-gray-400">{title}</p>
        {currentUser && (
          <AddToPlaylist
            song={song}
            userId={currentUser.id}
            onAdded={playlist => {
              setOpen(false);
              setNotice(`Added to ${playlist.name}`);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

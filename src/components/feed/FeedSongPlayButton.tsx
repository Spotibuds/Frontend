"use client";

import { PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { useAudio } from "@/lib/audio";
import type { Song } from "@/lib/api";

export default function FeedSongPlayButton({
  song,
  title,
}: {
  song: Song | null | undefined;
  title: string;
}) {
  const { currentSong, isPlaying, isLoading, playSong, togglePlayPause } = useAudio();
  const active = Boolean(song && currentSong?.id === song.id);
  const playing = active && isPlaying;
  const label = playing ? "Pause" : "Play";
  const Icon = playing ? PauseIcon : PlayIcon;
  return (
    <Button
      type="button"
      className="min-h-11 shrink-0"
      aria-label={`${label} ${title}`}
      aria-busy={(active && isLoading) || undefined}
      title={label}
      disabled={!song?.fileUrl?.trim()}
      onClick={event => {
        event.stopPropagation();
        if (!song?.fileUrl?.trim()) return;
        if (active) togglePlayPause();
        else playSong(song);
      }}
    >
      {active && isLoading ? (
        <ArrowPathIcon aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
      ) : (
        <Icon aria-hidden="true" className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}

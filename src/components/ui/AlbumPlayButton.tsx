"use client";
import { useState } from "react";
import { Play, Pause, Plus, LoaderCircle } from "lucide-react";
import { Album, musicApi } from "@/lib/api";
import { useAudio } from "@/lib/audio";
import { samePlaylist } from "@/lib/audioState";

export default function AlbumPlayButton({
  album,
  size = "medium",
  showAddToQueue = false,
}: {
  album: Album;
  size?: "small" | "medium" | "large";
  showAddToQueue?: boolean;
}) {
  const audio = useAudio();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const current =
    audio.currentSong?.album?.id === album.id &&
    audio.playlist.length === album.songs.length &&
    [...album.songs]
      .sort((a, b) => a.position - b.position)
      .every((song, index) => song.id === audio.playlist[index]?.id);
  const act = async (queue: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const songs = await musicApi.getAlbumSongs(album.id);
      if (!songs.length) {
        setNotice("This album has no available songs yet.");
        return;
      }
      if (queue) {
        audio.addToQueue(songs);
        setNotice(`${songs.length} songs added to queue`);
      } else if (
        audio.currentSong &&
        songs.some(song => song.id === audio.currentSong?.id) &&
        samePlaylist(audio.playlist, songs)
      )
        audio.togglePlayPause();
      else audio.playPlaylist(songs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Album could not be loaded. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            void act(false);
          }}
          disabled={busy}
          aria-busy={busy}
          className={`flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-purple-300 disabled:opacity-50 ${size === "large" ? "h-14 w-14" : "h-11 w-11"}`}
          aria-label={`${current && audio.isPlaying ? "Pause" : "Play"} ${album.title}`}
        >
          {busy ? (
            <LoaderCircle size={20} className="animate-spin" />
          ) : current && audio.isPlaying ? (
            <Pause size={20} />
          ) : (
            <Play size={20} />
          )}
        </button>
        {showAddToQueue && (
          <button
            type="button"
            disabled={busy}
            onClick={e => {
              e.stopPropagation();
              void act(true);
            }}
            className="icon-button"
            aria-label={`Add ${album.title} to queue`}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 max-w-56 text-xs text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 max-w-56 text-xs text-gray-300">
          {notice}
        </p>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PlayIcon, PauseIcon, PlusIcon, QueueListIcon } from "@heroicons/react/24/outline";
import { musicApi, identityApi, type Album, type Song } from "@/lib/api";
import { useAudio } from "@/lib/audio";
import { samePlaylist } from "@/lib/audioState";
import MusicImage from "@/components/ui/MusicImage";
import SongCard from "@/components/SongCard";
import AddToPlaylist from "@/components/AddToPlaylist";
import Dialog from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tracksError, setTracksError] = useState("");
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const user = identityApi.getCurrentUser();
  const audio = useAudio();
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      setTracksError("");
      const [details, tracks] = await Promise.allSettled([
        musicApi.getAlbum(id),
        musicApi.getAlbumSongs(id),
      ]);
      if (!active) return;
      if (details.status === "fulfilled") setAlbum(details.value);
      else
        setError(
          details.reason instanceof Error ? details.reason.message : "Album could not be loaded."
        );
      if (tracks.status === "fulfilled") setSongs(tracks.value);
      else setTracksError("Songs could not be loaded. Retry to listen to this album.");
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, retry]);
  const current =
    samePlaylist(audio.playlist, songs) && songs.some(song => song.id === audio.currentSong?.id);
  const play = (index?: number) => {
    if (current && (index === undefined || songs[index]?.id === audio.currentSong?.id))
      audio.togglePlayPause();
    else audio.playPlaylist(songs, index || 0);
  };
  if (loading)
    return (
      <div className="page-shell" role="status">
        Loading album…
      </div>
    );
  if (error || !album)
    return (
      <div className="page-shell">
        <p role="alert" className="mb-4 text-red-300">
          {error || "Album not found."}
        </p>
        <Button onClick={() => setRetry(v => v + 1)}>Retry</Button>
        <Link href="/music" className="ml-4 text-sm underline">
          Browse music
        </Link>
      </div>
    );
  const seconds = songs.reduce((sum, song) => sum + song.durationSec, 0);
  return (
    <div className="page-shell">
      <Link href="/music" className="mb-6 inline-block text-sm text-gray-400 hover:text-white">
        ← Browse music
      </Link>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        <MusicImage
          src={album.coverUrl}
          alt={album.title}
          size="xl"
          className="h-40 w-40 rounded-xl sm:h-52 sm:w-52"
          priority
        />
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold sm:text-4xl">{album.title}</h1>
          {album.artist && (
            <Link
              href={`/artist/${album.artist.id}`}
              className="mt-3 inline-block text-gray-300 hover:underline"
            >
              {album.artist.name}
            </Link>
          )}
          <p className="mt-3 text-sm text-gray-400">
            {album.releaseDate ? `${new Date(album.releaseDate).getFullYear()} · ` : ""}
            {songs.length} songs · {audio.formatTime(seconds)}
          </p>
        </div>
      </div>
      <div className="my-7 flex flex-wrap items-center gap-3">
        <Button disabled={!songs.length} onClick={() => play()}>
          {current && audio.isPlaying ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
          {current && audio.isPlaying ? "Pause" : "Play album"}
        </Button>
        <Button
          variant="secondary"
          disabled={!songs.length}
          onClick={() => {
            audio.addToQueue(songs);
            setNotice("Album added to queue");
          }}
        >
          <QueueListIcon className="h-5 w-5" />
          Add to queue
        </Button>
        <Button variant="ghost" disabled={!songs.length} onClick={() => setOpen(true)}>
          <PlusIcon className="h-5 w-5" />
          Add to playlist
        </Button>
      </div>
      {notice && (
        <p role="status" className="mb-4 text-sm text-purple-300">
          {notice}
        </p>
      )}
      {tracksError ? (
        <p role="alert" className="text-red-300">
          {tracksError}{" "}
          <button onClick={() => setRetry(v => v + 1)} className="underline">
            Retry
          </button>
        </p>
      ) : songs.length ? (
        songs.map((song, index) => (
          <SongCard key={song.id} song={song} index={index} onClick={() => play(index)} />
        ))
      ) : (
        <p className="py-8 text-gray-400">This album has no songs yet.</p>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add album to playlist">
        <p className="mb-4 text-sm text-gray-400">
          {album.title} · {songs.length} songs. Songs already saved will be skipped.
        </p>
        {user && songs.length ? (
          <AddToPlaylist
            song={songs[0]}
            songs={songs}
            userId={user.id}
            onAdded={playlist => {
              setOpen(false);
              setNotice(`Album saved to ${playlist.name}`);
            }}
          />
        ) : (
          <Link href="/" className="underline">
            Sign in to save this album
          </Link>
        )}
      </Dialog>
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  PlayIcon,
  PauseIcon,
  PencilIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LockClosedIcon,
  GlobeAltIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { PlaylistService, PLAYLIST_EVENT, type Playlist } from "@/lib/playlist";
import { identityApi } from "@/lib/api";
import { useAudio } from "@/lib/audio";
import { samePlaylist } from "@/lib/audioState";
import SongCard from "@/components/SongCard";
import MusicImage from "@/components/ui/MusicImage";
import PlaylistCoverUploader from "@/components/PlaylistCoverUploader";
import Dialog from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const audio = useAudio();
  const user = identityApi.getCurrentUser();
  const [data, setData] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", description: "", isPublic: false });
  const [removed, setRemoved] = useState<{ songId: string; order: string[] } | null>(null);
  const mutating = useRef(false);
  useEffect(() => {
    let active = true;
    let version = 0;
    const load = async () => {
      const request = ++version;
      try {
        const full = await PlaylistService.getPlaylist(id);
        if (active && request === version) {
          setData(full);
          setError("");
        }
      } catch (cause) {
        if (active && request === version)
          setError(cause instanceof Error ? cause.message : "Playlist could not be loaded. Retry.");
      } finally {
        if (active && request === version) setLoading(false);
      }
    };
    void load();
    const change = (event: Event) => {
      if (!mutating.current && (event as CustomEvent).detail?.id === id) void load();
    };
    window.addEventListener(PLAYLIST_EVENT, change);
    return () => {
      active = false;
      window.removeEventListener(PLAYLIST_EVENT, change);
    };
  }, [id, retry]);
  const canEdit = Boolean(
    user && data && (user.id === data.createdBy || user.roles?.includes("Admin"))
  );
  const current = Boolean(
    data &&
    samePlaylist(audio.playlist, data.songs) &&
    data.songs.some(song => song.id === audio.currentSong?.id)
  );
  const play = (index?: number) => {
    if (!data?.songs.length) return;
    if (current && (index === undefined || data.songs[index]?.id === audio.currentSong?.id))
      audio.togglePlayPause();
    else audio.playPlaylist(data.songs, index || 0);
  };
  const move = async (index: number, delta: number) => {
    if (!data || busy) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    const order = data.songs.map(song => song.id);
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    try {
      await PlaylistService.reorderSongs(id, order);
      setData(await PlaylistService.getPlaylist(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Song order could not be saved. Retry.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  const remove = async (songId: string) => {
    if (!data || busy) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const order = data.songs.map(song => song.id);
      await PlaylistService.removeSongFromPlaylist(id, songId);
      setRemoved({ songId, order });
      setNotice("Song removed from this playlist.");
      setData(await PlaylistService.getPlaylist(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Song could not be removed. Retry.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  const undo = async () => {
    if (!removed || busy) return;
    mutating.current = true;
    setBusy(true);
    try {
      const before = await PlaylistService.getPlaylist(id);
      if (!before.songs.some(song => song.id === removed.songId))
        await PlaylistService.addSongToPlaylist(id, removed.songId);
      const full = await PlaylistService.getPlaylist(id);
      const available = new Set(full.songs.map(song => song.id));
      const order = [
        ...removed.order.filter(songId => available.has(songId)),
        ...full.songs.map(song => song.id).filter(songId => !removed.order.includes(songId)),
      ];
      await PlaylistService.reorderSongs(id, order);
      setData(await PlaylistService.getPlaylist(id));
      setRemoved(null);
      setNotice("Song restored.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Song could not be restored. Retry.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !form.name.trim()) return;
    mutating.current = true;
    setSaving(true);
    setError("");
    try {
      await PlaylistService.updatePlaylist(id, {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
      });
      setData(await PlaylistService.getPlaylist(id));
      setEditing(false);
      setNotice("Playlist updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playlist could not be saved. Retry.");
    } finally {
      mutating.current = false;
      setSaving(false);
    }
  };
  if (loading)
    return (
      <div className="page-shell" role="status">
        Loading playlist…
      </div>
    );
  if (!data)
    return (
      <div className="page-shell">
        <p role="alert" className="mb-4 text-red-300">
          {error || "Playlist not found."}
        </p>
        <Button onClick={() => setRetry(v => v + 1)}>Retry</Button>
        <Link href="/playlists" className="ml-4 underline">
          Your library
        </Link>
      </div>
    );
  return (
    <div className="page-shell">
      <Link href="/playlists" className="mb-6 inline-block text-sm text-gray-400 hover:text-white">
        ← Your library
      </Link>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        {data.coverUrl ? (
          <MusicImage
            src={data.coverUrl}
            alt={data.name}
            size="xl"
            className="h-40 w-40 rounded-xl sm:h-52 sm:w-52"
          />
        ) : (
          <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-xl bg-gray-800 sm:h-52 sm:w-52">
            <MusicalNoteIcon className="h-16 w-16 text-purple-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-3xl font-semibold sm:text-4xl">{data.name}</h1>
          {data.description && (
            <p className="mt-3 max-w-[65ch] break-words text-sm text-gray-300">
              {data.description}
            </p>
          )}
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
            {data.isPublic ? (
              <GlobeAltIcon className="h-4 w-4" />
            ) : (
              <LockClosedIcon className="h-4 w-4" />
            )}
            {data.isPublic ? "Public" : "Private"}
            <span>
              · {data.songs.length} songs ·{" "}
              {audio.formatTime(data.songs.reduce((sum, song) => sum + song.durationSec, 0))}
            </span>
          </p>
        </div>
      </div>
      <div className="my-7 flex items-center gap-3">
        <Button disabled={!data.songs.length} onClick={() => play()}>
          {current && audio.isPlaying ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
          {current && audio.isPlaying ? "Pause" : "Play"}
        </Button>
        {canEdit && (
          <Button
            variant="secondary"
            onClick={() => {
              setForm({
                name: data.name,
                description: data.description || "",
                isPublic: data.isPublic || false,
              });
              setEditing(true);
              setError("");
            }}
          >
            <PencilIcon className="h-4 w-4" />
            Edit playlist
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-200">
          {error}{" "}
          <button onClick={() => setRetry(v => v + 1)} className="underline">
            Reload playlist
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm text-purple-300">
          {notice}{" "}
          {removed && (
            <button
              className="ml-2 underline"
              disabled={busy}
              onClick={() => {
                void undo();
              }}
            >
              Undo removal
            </button>
          )}
        </p>
      )}
      {data.songs.length ? (
        <div>
          {data.songs.map((song, index) => (
            <div key={song.id} className="border-b border-gray-800">
              <SongCard
                song={song}
                index={index}
                onClick={() => play(index)}
                showAddToPlaylist={false}
              />
              {canEdit && (
                <div className="mb-1 flex justify-end gap-1">
                  <button
                    className="icon-button"
                    disabled={busy || index === 0}
                    aria-label={`Move ${song.title} up`}
                    onClick={() => {
                      void move(index, -1);
                    }}
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy || index === data.songs.length - 1}
                    aria-label={`Move ${song.title} down`}
                    onClick={() => {
                      void move(index, 1);
                    }}
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Remove ${song.title} from playlist`}
                    onClick={() => {
                      void remove(song.id);
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12">
          <h2 className="text-xl font-semibold">Your next favorite belongs here</h2>
          <p className="mt-2 text-sm text-gray-400">
            Find a song, then use “Add to playlist” to save it here.
          </p>
          <Link href="/music" className="mt-4 inline-block text-sm text-purple-300 underline">
            Browse music
          </Link>
        </div>
      )}
      <Dialog
        open={editing}
        onClose={() => {
          if (!saving) setEditing(false);
        }}
        title="Edit playlist"
      >
        {error && (
          <p role="alert" className="mb-3 text-red-300">
            {error}
          </p>
        )}
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Playlist name"
            value={form.name}
            maxLength={200}
            disabled={data.name === "Liked Songs"}
            onChange={e => setForm({ ...form, name: e.target.value })}
            required
          />
          <div>
            <label htmlFor="edit-description" className="mb-2 block text-sm text-gray-300">
              Description (optional)
            </label>
            <textarea
              id="edit-description"
              value={form.description}
              maxLength={2000}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-sm"
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={e => setForm({ ...form, isPublic: e.target.checked })}
            />
            Make this playlist public
          </label>
          <PlaylistCoverUploader
            playlistId={id}
            currentCoverUrl={data.coverUrl}
            onCoverUpdated={url => setData({ ...data, coverUrl: url || undefined })}
          />
          <Button loading={saving} disabled={!form.name.trim()} type="submit">
            Save playlist
          </Button>
          <p className="text-xs text-gray-400">Cover changes are saved immediately.</p>
        </form>
      </Dialog>
    </div>
  );
}

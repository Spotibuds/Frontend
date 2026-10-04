"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  PlusIcon,
  PlayIcon,
  PencilIcon,
  TrashIcon,
  HeartIcon,
  MusicalNoteIcon,
  LockClosedIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import {
  PlaylistService,
  PLAYLIST_EVENT,
  type Playlist,
  type CreatePlaylistDto,
} from "@/lib/playlist";
import { useAudio } from "@/lib/audio";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Dialog from "@/components/ui/Dialog";
import MusicImage from "@/components/ui/MusicImage";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

export default function PlaylistManager({
  userId,
  onPlayPlaylist,
}: {
  userId: string;
  onPlayPlaylist?: (playlist: Playlist) => void;
}) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<CreatePlaylistDto>({
    name: "",
    description: "",
    isPublic: false,
  });
  const audio = useAudio();
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const request = ++loadVersion.current;
    try {
      const result = await PlaylistService.getUserPlaylists(userId);
      if (request !== loadVersion.current) return;
      setPlaylists(result);
      setError("");
    } catch (cause) {
      if (request !== loadVersion.current) return;
      setError(cause instanceof Error ? cause.message : "Your library could not be loaded. Retry.");
    } finally {
      if (request === loadVersion.current) setLoading(false);
    }
  }, [userId]);
  useDeferredEffect(() => {
    void load();
    const invalidate = () => {
      loadVersion.current++;
    };
    return invalidate;
  }, [load]);
  useEffect(() => {
    const changed = () => {
      void load();
    };
    window.addEventListener(PLAYLIST_EVENT, changed);
    return () => window.removeEventListener(PLAYLIST_EVENT, changed);
  }, [load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const dto = { ...form, name: form.name.trim(), description: form.description?.trim() || "" };
      if (editing) await PlaylistService.updatePlaylist(editing.id, dto);
      else await PlaylistService.createPlaylist(userId, dto);
      setNotice(editing ? "Playlist updated" : "Playlist created");
      setEditing(null);
      setCreating(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playlist could not be saved. Retry.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!deleting || saving) return;
    setSaving(true);
    try {
      await PlaylistService.deletePlaylist(deleting.id);
      setDeleting(null);
      setNotice("Playlist deleted. The songs remain in the music catalogue.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playlist could not be deleted. Retry.");
    } finally {
      setSaving(false);
    }
  };
  const play = async (item: Playlist) => {
    setPlaying(item.id);
    try {
      const full = await PlaylistService.getPlaylist(item.id);
      if (!full.songs.length) {
        setNotice("This playlist has no available songs yet.");
        return;
      }
      audio.playPlaylist(full.songs);
      onPlayPlaylist?.(full);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playlist could not be played. Retry.");
    } finally {
      setPlaying(null);
    }
  };
  const editor = (
    <form onSubmit={save} className="space-y-4">
      <Input
        label="Playlist name"
        value={form.name}
        maxLength={200}
        required
        disabled={editing?.name === "Liked Songs"}
        onChange={e => setForm({ ...form, name: e.target.value })}
        placeholder="Late night, road trips, anything"
      />
      <div>
        <label htmlFor="playlist-description" className="mb-2 block text-sm text-gray-300">
          Description <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          id="playlist-description"
          value={form.description || ""}
          maxLength={2000}
          onChange={e => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-900 p-3 text-sm"
          rows={3}
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.isPublic || false}
          onChange={e => setForm({ ...form, isPublic: e.target.checked })}
        />
        Make this playlist public
      </label>
      <p className="text-xs text-gray-400">
        {form.isPublic
          ? "Anyone can view and play this playlist."
          : "Only you can view and play this playlist."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving} disabled={!form.name.trim()}>
          Save playlist
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setCreating(false);
            setEditing(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
  const visible = [...playlists]
    .sort((a, b) => (a.name === "Liked Songs" ? -1 : b.name === "Liked Songs" ? 1 : 0))
    .filter(item => item.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full sm:max-w-xs">
          <Input
            label="Find in your library"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Playlist name"
          />
        </div>
        <Button
          onClick={() => {
            setCreating(!creating);
            setForm({ name: "", description: "", isPublic: false });
            setError("");
          }}
        >
          <PlusIcon className="h-5 w-5" />
          New playlist
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">
          {error}{" "}
          <button
            onClick={() => {
              void load();
            }}
            className="underline"
          >
            Reload library
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-purple-300">
          {notice}
        </p>
      )}
      {creating && (
        <section className="max-w-xl rounded-xl bg-gray-800 p-5">
          <h2 className="mb-4 text-lg font-semibold">Create a playlist</h2>
          {editor}
        </section>
      )}
      {loading ? (
        <p role="status" className="py-12 text-gray-400">
          Loading your library…
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
          {visible.map(item => {
            const count = item.songCount ?? item.songs.length;
            return (
              <article key={item.id} className="min-w-0">
                <Link
                  href={`/playlists/${item.id}`}
                  className="block aspect-square overflow-hidden rounded-xl bg-gray-800"
                  aria-label={`Open ${item.name}`}
                >
                  {item.coverUrl ? (
                    <MusicImage
                      src={item.coverUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      size="large"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
                      {item.name === "Liked Songs" ? (
                        <HeartIcon className="h-14 w-14 fill-purple-400 text-purple-400" />
                      ) : (
                        <MusicalNoteIcon className="h-14 w-14" />
                      )}
                      <span className="max-w-[80%] truncate text-sm">{item.name}</span>
                    </div>
                  )}
                </Link>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/playlists/${item.id}`}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                      {item.isPublic ? (
                        <GlobeAltIcon className="h-3 w-3" />
                      ) : (
                        <LockClosedIcon className="h-3 w-3" />
                      )}
                      {count} {count === 1 ? "song" : "songs"}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Play ${item.name}`}
                    disabled={!count || playing === item.id}
                    onClick={() => {
                      void play(item);
                    }}
                  >
                    <PlayIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => {
                      setEditing(item);
                      setForm({
                        name: item.name,
                        description: item.description || "",
                        isPublic: item.isPublic || false,
                      });
                      setError("");
                    }}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => {
                      setDeleting(item);
                      setError("");
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && !error && !visible.length && (
        <div className="py-10">
          <h2 className="text-xl font-semibold">
            {filter ? "No matching playlists" : "Make room for your music"}
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {filter
              ? "Try another name or clear your search."
              : "Create a playlist, or save songs with the heart to start your Liked Songs collection."}
          </p>
        </div>
      )}
      <Dialog
        open={Boolean(editing)}
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        title="Edit playlist"
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {editor}
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onClose={() => {
          if (!saving) setDeleting(null);
        }}
        title="Delete playlist?"
      >
        <p className="text-sm text-gray-300">
          “{deleting?.name}” and its saved order will be deleted. The songs remain available. This
          cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" disabled={saving} onClick={() => setDeleting(null)}>
            Keep playlist
          </Button>
          <Button
            variant="destructive"
            loading={saving}
            onClick={() => {
              void remove();
            }}
          >
            Delete playlist
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

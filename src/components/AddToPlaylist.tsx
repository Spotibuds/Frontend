"use client";
import { useState, useCallback, useRef } from "react";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import { PlusIcon, CheckIcon } from "@heroicons/react/24/outline";
import { PlaylistService, type Playlist } from "@/lib/playlist";
import { getSessionGeneration } from "@/lib/session";
import { type Song } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AddToPlaylist({
  song,
  songs,
  userId,
  onAdded,
}: {
  song: Song;
  songs?: Song[];
  userId: string;
  onAdded?: (playlist: Playlist) => void;
}) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const run = useRef(0);
  const load = useCallback(async () => {
    const request = ++run.current;
    const generation = getSessionGeneration();
    setLoading(true);
    setError("");
    try {
      const lists = await PlaylistService.getUserPlaylists(userId);
      const full = await Promise.all(
        lists.map(item =>
          (item.songCount ?? item.songs.length) > item.songs.length
            ? PlaylistService.getPlaylist(item.id)
            : item
        )
      );
      if (request === run.current && generation === getSessionGeneration()) setPlaylists(full);
    } catch (cause) {
      if (request === run.current)
        setError(cause instanceof Error ? cause.message : "Playlists could not be loaded. Retry.");
    } finally {
      if (request === run.current) setLoading(false);
    }
  }, [userId]);
  useDeferredEffect(() => {
    void load();
    const invalidate = () => {
      run.current++;
    };
    return invalidate;
  }, [load]);
  const add = async (playlist: Playlist) => {
    if (addingTo) return;
    setAddingTo(playlist.id);
    setError("");
    try {
      await PlaylistService.addSongsToPlaylist(playlist.id, songs || [song]);
      onAdded?.(playlist);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Song could not be added. Retry.");
    } finally {
      setAddingTo(null);
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || creating || addingTo) return;
    setCreating(true);
    setError("");
    try {
      const playlist = await PlaylistService.createPlaylist(userId, {
        name: name.trim(),
        isPublic: false,
      });
      setName("");
      await add(playlist);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playlist could not be created. Retry.");
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            className="underline"
          >
            Reload playlists
          </button>
        </p>
      )}
      <Input
        label="Find a playlist"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Playlist name"
      />
      {loading ? (
        <p role="status" className="py-5 text-sm text-gray-400">
          Loading playlists…
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {playlists
            .filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
            .map(item => {
              const existing = new Set(item.songs.map(track => track.id));
              const included = (songs || [song]).every(track => existing.has(track.id));
              return (
                <button
                  type="button"
                  key={item.id}
                  disabled={included || Boolean(addingTo) || creating}
                  onClick={() => {
                    void add(item);
                  }}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-lg p-3 text-left hover:bg-gray-700 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="text-xs text-gray-400">
                      {included ? "Already added" : `${item.songCount ?? item.songs.length} songs`}
                    </span>
                  </span>
                  {addingTo === item.id ? (
                    <span role="status" className="text-xs text-gray-400">
                      Adding…
                    </span>
                  ) : included ? (
                    <CheckIcon className="h-5 w-5 text-purple-400" />
                  ) : (
                    <PlusIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              );
            })}
          {!playlists.length && (
            <p className="py-5 text-sm text-gray-400">
              Create a playlist below to save this music.
            </p>
          )}
          {playlists.length > 0 &&
            !playlists.some(item => item.name.toLowerCase().includes(filter.toLowerCase())) && (
              <p className="py-5 text-sm text-gray-400">No playlists match “{filter}”.</p>
            )}
        </div>
      )}
      <form onSubmit={create} className="border-t border-gray-700 pt-4">
        <Input
          label="Create a new playlist"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={200}
          placeholder="Give it a name"
        />
        <Button
          type="submit"
          className="mt-3"
          loading={creating}
          disabled={!name.trim() || Boolean(addingTo)}
        >
          Create and add
        </Button>
        <p className="mt-2 text-xs text-gray-400">
          New playlists are private. You can share them from your library.
        </p>
      </form>
    </div>
  );
}

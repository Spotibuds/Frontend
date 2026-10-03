"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import React, { useState, useCallback } from "react";
import { PlusIcon, CheckIcon } from "@heroicons/react/24/outline";
import { PlaylistService, Playlist } from "@/lib/playlist";
import { Song } from "@/lib/api";

interface AddToPlaylistProps {
  song: Song;
  userId: string;
  onAdded?: (playlist: Playlist) => void;
}

export default function AddToPlaylist({ song, userId, onAdded }: AddToPlaylistProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const loadUserPlaylists = useCallback(async () => {
    try {
      const userPlaylists = await PlaylistService.getUserPlaylists(userId);
      setPlaylists(
        await Promise.all(userPlaylists.map(item => PlaylistService.getPlaylist(item.id)))
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Playlists could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useDeferredEffect(() => {
    loadUserPlaylists();
  }, [loadUserPlaylists]);

  const handleAddToPlaylist = async (playlist: Playlist) => {
    try {
      setAddingTo(playlist.id);
      await PlaylistService.addSongToPlaylist(playlist.id, song.id);

      // Reload playlists to get the updated data from backend
      await loadUserPlaylists();
      onAdded?.(playlist);

      // Show success feedback
      setTimeout(() => setAddingTo(null), 1000);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Song could not be added. Retry when Music is available."
      );
      setAddingTo(null);
    }
  };

  const isSongInPlaylist = (playlist: Playlist) => {
    if (!playlist.songs || playlist.songs.length === 0) {
      return false;
    }

    // Simple string comparison to avoid any potential type issues
    const songIds = playlist.songs.map(s => String(s.id));
    const targetId = String(song.id);
    const isInPlaylist = songIds.includes(targetId);

    return isInPlaylist;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="max-h-60 overflow-y-auto">
      {error && (
        <p role="alert" className="text-red-300">
          {error} <button onClick={loadUserPlaylists}>Retry</button>
        </p>
      )}
      {playlists.length === 0 ? (
        <div className="p-4 text-gray-400 text-center">
          <p>No playlists found</p>
          <p className="text-sm">Create a playlist first</p>
        </div>
      ) : (
        playlists.map(playlist => {
          const isInPlaylist = isSongInPlaylist(playlist);
          const isAdding = addingTo === playlist.id;

          return (
            <button
              key={playlist.id}
              onClick={() => !isInPlaylist && !isAdding && handleAddToPlaylist(playlist)}
              disabled={isInPlaylist || isAdding}
              className={`w-full p-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between rounded-lg ${
                isInPlaylist ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-white font-medium truncate">{playlist.name}</div>
                <div className="text-gray-400 text-sm">{playlist.songs.length} songs</div>
              </div>

              <div className="flex-shrink-0 ml-3">
                {isAdding ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                ) : isInPlaylist ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <PlusIcon className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

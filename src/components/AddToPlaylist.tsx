'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import { PlaylistService, Playlist } from '@/lib/playlist';
import { Song } from '@/lib/api';

interface AddToPlaylistProps {
  song: Song;
  userId: string;
  onAdded?: (playlist: Playlist) => void;
}

export default function AddToPlaylist({ song, userId, onAdded }: AddToPlaylistProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const loadUserPlaylists = useCallback(async () => {
    try {
      const userPlaylists = await PlaylistService.getUserPlaylists(userId);
      setPlaylists(userPlaylists);
    } catch (error) {
      console.error('Failed to load playlists:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
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
      console.error('Failed to add song to playlist:', error);
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
    
    console.log(`Checking playlist "${playlist.name}":`, {
      targetSongId: targetId,
      targetSongTitle: song.title,
      playlistSongIds: songIds,
      playlistSongs: playlist.songs.map(s => ({ id: s.id, title: s.title })),
      result: isInPlaylist
    });
    
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
      {playlists.length === 0 ? (
        <div className="p-4 text-gray-400 text-center">
          <p>No playlists found</p>
          <p className="text-sm">Create a playlist first</p>
        </div>
      ) : (
        playlists.map((playlist) => {
          const isInPlaylist = isSongInPlaylist(playlist);
          const isAdding = addingTo === playlist.id;
          
          return (
            <button
              key={playlist.id}
              onClick={() => !isInPlaylist && !isAdding && handleAddToPlaylist(playlist)}
              disabled={isInPlaylist || isAdding}
              className={`w-full p-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between rounded-lg ${
                isInPlaylist ? 'opacity-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-white font-medium truncate">
                  {playlist.name}
                </div>
                <div className="text-gray-400 text-sm">
                  {playlist.songs.length} songs
                </div>
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

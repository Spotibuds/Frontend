"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import SongCard from '@/components/SongCard';
import { PlaylistService, Playlist } from '@/lib/playlist';
import { musicApi, Song, safeString } from '@/lib/api';

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.id as string;
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaylistData = async () => {
      if (!playlistId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Fetch playlist details
        const playlistData = await PlaylistService.getPlaylist(playlistId);
        setPlaylist(playlistData);

        // Fetch song details for each song in the playlist
        if (playlistData.songs && playlistData.songs.length > 0) {
          try {
            const allSongs = await musicApi.getSongs();
            const playlistSongs = playlistData.songs
              .map(songData => {
                // Handle both string IDs and Song objects
                const songId = typeof songData === 'string' ? songData : songData.id;
                return allSongs.find(song => song.id === songId);
              })
              .filter((song): song is Song => song !== undefined);
            setSongs(playlistSongs);
          } catch (error) {
            console.warn('Failed to load playlist songs:', error);
            setSongs([]);
          }
        } else {
          setSongs([]);
        }
      } catch (error) {
        console.error('Error fetching playlist data:', error);
        setError('Failed to load playlist data');
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylistData();
  }, [playlistId]);

  const getTotalDuration = () => {
    const totalSeconds = songs.reduce((acc, song) => acc + (song.durationSec || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading playlist...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !playlist) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Playlist not found'}</p>
            <button 
              onClick={() => router.back()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
            >
              Go Back
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start space-x-6 mb-8">
          {/* Playlist Cover */}
          <div className="flex-shrink-0">
            <div className="w-64 h-64 bg-gradient-to-br from-green-500 to-blue-500 rounded-xl shadow-2xl flex items-center justify-center">
              <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* Playlist Info */}
          <div className="flex-1 min-w-0 pt-4">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">Playlist</p>
            <h1 className="text-4xl font-bold text-white mb-4 break-words">{safeString(playlist.name)}</h1>
            
            {playlist.description && (
              <p className="text-gray-300 mb-4 break-words">{safeString(playlist.description)}</p>
            )}
            
            <div className="flex items-center space-x-2 text-gray-300 mb-4">
              <span>{songs.length} songs</span>
              {songs.length > 0 && (
                <>
                  <span>•</span>
                  <span>{getTotalDuration()}</span>
                </>
              )}
              {playlist.createdAt && (
                <>
                  <span>•</span>
                  <span>Created {formatDate(playlist.createdAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Songs List */}
        {songs.length > 0 ? (
          <div className="space-y-2">
            {songs.map((song, index) => (
              <SongCard 
                key={song.id} 
                song={song}
                index={index}
                showDuration={true}
                showAddToPlaylist={true}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">This playlist is empty</p>
            <p className="text-gray-500 text-sm">Add some songs to get started!</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

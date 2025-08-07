'use client';

import React, { useState } from 'react';
import { Play, Pause, Plus } from 'lucide-react';
import { Album, musicApi } from '@/lib/api';
import { useAudio } from '@/lib/audio';

interface AlbumPlayButtonProps {
  album: Album;
  size?: 'small' | 'medium' | 'large';
  showAddToQueue?: boolean;
}

export default function AlbumPlayButton({ 
  album, 
  size = 'medium',
  showAddToQueue = false 
}: AlbumPlayButtonProps) {
  const { currentSong, isPlaying, playSong, togglePlayPause, addToQueue, clearQueue } = useAudio();
  const [isLoading, setIsLoading] = useState(false);

  // Check if any song from this album is currently playing
  const isCurrentAlbumPlaying = currentSong?.album?.id === album.id && isPlaying;

  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16'
  };

  const iconSizes = {
    small: 16,
    medium: 20,
    large: 24
  };

  const handlePlayAlbum = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If current album is playing, just toggle play/pause
    if (isCurrentAlbumPlaying) {
      togglePlayPause();
      return;
    }

    try {
      setIsLoading(true);
      const albumSongs = await musicApi.getAlbumSongs(album.id);
      
      if (albumSongs.length > 0) {
        // Clear the current queue first
        clearQueue();
        
        // Start playing the first song
        const firstSong = albumSongs[0];
        playSong(firstSong);
        
        // Add the remaining songs to the queue (if any)
        if (albumSongs.length > 1) {
          const remainingSongs = albumSongs.slice(1);
          addToQueue(remainingSongs);
        }
      }
    } catch (error) {
      console.error('Error playing album:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      setIsLoading(true);
      const albumSongs = await musicApi.getAlbumSongs(album.id);
      
      if (albumSongs.length > 0) {
        addToQueue(albumSongs);
      }
    } catch (error) {
      console.error('Error adding album to queue:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePlayAlbum}
        disabled={isLoading}
        className={`${sizeClasses[size]} bg-green-500 hover:bg-green-400 text-white rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100`}
        title={isCurrentAlbumPlaying ? 'Pause album' : 'Play album'}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full border-2 border-white border-t-transparent w-4 h-4" />
        ) : isCurrentAlbumPlaying ? (
          <Pause size={iconSizes[size]} />
        ) : (
          <Play size={iconSizes[size]} className="ml-0.5" />
        )}
      </button>

      {showAddToQueue && (
        <button
          onClick={handleAddToQueue}
          disabled={isLoading}
          className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 disabled:opacity-50"
          title="Add album to queue"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

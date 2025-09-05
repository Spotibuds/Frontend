'use client';

import React, { useState } from 'react';
import { PlayIcon, PlusIcon, QueueListIcon } from '@heroicons/react/24/outline';
import MusicImage from '@/components/ui/MusicImage';
import { Button } from '@/components/ui/Button';
import AddToPlaylist from '@/components/AddToPlaylist';
import { Song, safeString, processArtists } from '@/lib/api';
import { identityApi } from '@/lib/api';
import { useAudio } from '@/lib/audio';

interface SongCardProps {
  song: Song;
  showDuration?: boolean;
  showAddToPlaylist?: boolean;
  showAddToQueue?: boolean;
  className?: string;
  index?: number;
  onClick?: () => void;
}

export default function SongCard({ 
  song, 
  showDuration = true, 
  showAddToPlaylist = true,
  showAddToQueue = true,
  className = '',
  index,
  onClick 
}: SongCardProps) {
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const { playSong, addToQueue, state } = useAudio();
  const { currentSong } = state;
  const currentUser = identityApi.getCurrentUser();

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    playSong(song);
  };

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser) {
      setShowPlaylistModal(true);
    }
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(song);
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      playSong(song);
    }
  };

  const isCurrentSong = currentSong?.id === song.id;

  return (
    <>
      <div
        onClick={handleClick}
        className={`group cursor-pointer p-3 sm:p-4 rounded-lg hover:bg-gray-800/50 transition-all duration-200 ${
          isCurrentSong ? 'bg-purple-900/30' : ''
        } ${className}`}
      >
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Song Number or Play Button */}
          {index !== undefined && (
            <div className="w-6 sm:w-8 flex items-center justify-center">
              <span className={`text-xs sm:text-sm group-hover:hidden ${
                isCurrentSong ? 'text-purple-400' : 'text-gray-400'
              }`}>
                {index + 1}
              </span>
              <button
                onClick={handlePlay}
                className="hidden group-hover:flex w-6 h-6 sm:w-8 sm:h-8 bg-purple-600 hover:bg-purple-700 rounded-full items-center justify-center transition-colors"
              >
                <PlayIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white ml-0.5" />
              </button>
            </div>
          )}

          {/* Album Cover */}
          <div className="flex-shrink-0">
            <MusicImage
              src={song.coverUrl}
              alt={safeString(song.title)}
              fallbackText={safeString(song.title)}
              size="medium"
              type="square"
              className="shadow-lg w-10 h-10 sm:w-12 sm:h-12"
            />
          </div>

          {/* Song Info */}
          <div className="flex-1 min-w-0">
            <h3 className={`font-medium text-sm sm:text-base truncate group-hover:underline ${
              isCurrentSong ? 'text-purple-400' : 'text-white'
            }`}>
              {safeString(song.title)}
            </h3>
            <p className="text-gray-400 text-xs sm:text-sm truncate">
              {processArtists(song.artists).join(', ')}
            </p>
            {song.genre && (
              <p className="text-gray-500 text-xs truncate">
                {safeString(song.genre)}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-1 sm:space-x-2 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
            {showAddToQueue && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAddToQueue}
                className="p-1.5 sm:p-2 hover:bg-gray-700 rounded-full"
                title="Add to queue"
              >
                <QueueListIcon className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
            )}
            {showAddToPlaylist && currentUser && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAddToPlaylist}
                className="p-1.5 sm:p-2 hover:bg-gray-700 rounded-full"
                title="Add to playlist"
              >
                <PlusIcon className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
            )}
          </div>

          {/* Duration */}
          {showDuration && (
            <div className="text-gray-400 text-xs sm:text-sm text-right min-w-10 sm:min-w-12">
              {formatDuration(song.durationSec)}
            </div>
          )}
        </div>
      </div>

      {/* Add to Playlist Modal */}
      {showPlaylistModal && currentUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-white">Add to Playlist</h3>
              <button
                onClick={() => setShowPlaylistModal(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            <AddToPlaylist
              song={song}
              userId={currentUser.id}
              onAdded={() => setShowPlaylistModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ClockIcon, MusicalNoteIcon, PlayIcon } from '@heroicons/react/24/outline';
import MusicImage from '@/components/ui/MusicImage';
import { PlaylistService, ListeningHistoryItem } from '@/lib/playlist';
import { useAudio } from '@/lib/audio';
import { Song, musicApi } from '@/lib/api';

interface ListeningHistoryProps {
  userId: string;
}

export default function ListeningHistory({ userId }: ListeningHistoryProps) {
  const [historyItems, setHistoryItems] = useState<ListeningHistoryItem[]>([]);
  const [songs, setSongs] = useState<{ [key: string]: Song }>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { playSong } = useAudio();

  const loadHistory = useCallback(async (skip = 0) => {
    try {
      if (skip === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const data = await PlaylistService.getListeningHistory(userId, skip);
      
      if (skip === 0) {
        setHistoryItems(data);
      } else {
        setHistoryItems(prev => [...prev, ...data]);
      }
      
      setHasMore(data.length === 10); // Assuming 10 items per page
      
      // Load song details for any new items
      const newItems = skip === 0 ? data : data;
      const songIds = newItems.map(item => item.songId).filter(id => !songs[id]);
      
      if (songIds.length > 0) {
        const songPromises = songIds.map(id => musicApi.getSong(id));
        const songResults = await Promise.allSettled(songPromises);
        
        const newSongs: { [key: string]: Song } = {};
        songResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const song = result.value;
            if (song) {
              newSongs[song.id] = song;
            }
          }
        });
        
        setSongs(prev => ({ ...prev, ...newSongs }));
      }
    } catch (error) {
      console.error('Failed to load listening history:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId, songs]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadHistory(historyItems.length);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    if (diffDays > 0) {
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } else if (diffHours > 0) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffMinutes > 0) {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    } else {
      return 'Just now';
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handlePlay = (song: Song) => {
    playSong(song);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <ClockIcon className="w-8 h-8 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">Listening History</h2>
      </div>

      {historyItems.length === 0 ? (
        <div className="text-center py-12">
          <MusicalNoteIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">No listening history yet</h3>
          <p className="text-gray-500">Start listening to music to see your history here!</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {historyItems.map((item, index) => {
              const song = songs[item.songId];
              
              return (
                <div
                  key={`${item.songId}-${item.playedAt}-${index}`}
                  className="bg-gray-800 rounded-lg p-4 flex items-center space-x-4 hover:bg-gray-750 transition-colors group"
                >
                  <div className="flex-shrink-0">
                    {song?.coverUrl || item.coverUrl ? (
                      <MusicImage
                        src={song?.coverUrl || item.coverUrl}
                        alt={song?.title || item.songTitle || 'Song cover'}
                        fallbackText={song?.title || item.songTitle || 'Song'}
                        size="medium"
                        type="square"
                        className="w-12 h-12"
                      />
                    ) : song ? (
                      <button
                        onClick={() => handlePlay(song)}
                        className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center group-hover:bg-purple-600 transition-colors"
                      >
                        <PlayIcon className="w-6 h-6 text-white" />
                      </button>
                    ) : (
                      <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center">
                        <MusicalNoteIcon className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-white font-medium truncate">
                          {song?.title || item.songTitle || 'Unknown Song'}
                        </h3>
                        <p className="text-gray-400 text-sm truncate">
                          {song?.artists?.[0]?.name || item.artist || 'Unknown Artist'}
                        </p>
                      </div>
                      <div className="text-right text-sm text-gray-400 flex-shrink-0 ml-4">
                        <div>{formatDate(item.playedAt)}</div>
                        <div className="text-xs">
                          Listened for {formatDuration(item.duration)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg transition-colors"
              >
                {loadingMore ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Loading...</span>
                  </div>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

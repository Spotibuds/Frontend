'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import MusicImage from '@/components/ui/MusicImage';
import { PlaylistService, Playlist, PlaylistSong } from '@/lib/playlist';
import { identityApi } from '@/lib/api';
import { useAudio } from '@/lib/audio';
import { 
  PlayIcon, 
  PauseIcon, 
  MusicalNoteIcon, 
  ClockIcon, 
  ArrowLeftIcon,
  TrashIcon,
  QueueListIcon
} from '@heroicons/react/24/outline';

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params?.id as string;
  
  const [playlistData, setPlaylistData] = useState<Playlist | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { 
    togglePlayPause,
    addToQueue,
    clearQueue,
    playSong,
    currentSong,
    isPlaying,
    playlist: currentPlaylist
  } = useAudio();

  const loadPlaylist = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await PlaylistService.getPlaylist(playlistId);
      setPlaylistData(data);
    } catch (error) {
      console.error('Failed to load playlist:', error);
      setError('Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    const user = identityApi.getCurrentUser();
    setCurrentUser(user);
    
    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId, loadPlaylist]);

  const handlePlayPlaylist = () => {
    if (!playlistData || playlistData.songs.length === 0) return;
    
    // If already playing this playlist, toggle pause
    if (isCurrentPlaylistPlaying && isPlaying) {
      togglePlayPause();
      return;
    }
    
    // Clear the existing queue and add playlist songs
    clearQueue();
    const [firstSong, ...remainingSongs] = playlistData.songs;
    playSong(firstSong);
    if (remainingSongs.length > 0) {
      addToQueue(remainingSongs);
    }
  };

  const handlePlaySong = (songIndex: number) => {
    if (!playlistData) return;
    
    const song = playlistData.songs[songIndex];
    const isCurrentSong = currentSong?.id === song.id;
    const isPlayingThisSong = isCurrentSong && isPlaying;
    
    // If this song is already playing, pause it
    if (isPlayingThisSong) {
      togglePlayPause();
      return;
    }
    
    // Clear queue and play from this song
    clearQueue();
    const remainingSongs = playlistData.songs.slice(songIndex + 1);
    playSong(song);
    if (remainingSongs.length > 0) {
      addToQueue(remainingSongs);
    }
  };

  const handleRemoveSong = async (songId: string) => {
    if (!playlistData || !confirm('Remove this song from the playlist?')) return;
    
    try {
      await PlaylistService.removeSongFromPlaylist(playlistData.id, songId);
      const updatedPlaylist = await PlaylistService.getPlaylist(playlistData.id);
      setPlaylistData(updatedPlaylist);
    } catch (error) {
      console.error('Failed to remove song:', error);
    }
  };

  const handleAddToQueue = (song: PlaylistSong) => {
    addToQueue([song]);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getTotalDuration = () => {
    if (!playlistData) return 0;
    return playlistData.songs.reduce((total, song) => total + (song.durationSec || 0), 0);
  };

  const getArtistName = (song: PlaylistSong) => {
    if (song.artists && song.artists.length > 0) {
      return song.artists[0].name;
    }
    return 'Unknown Artist';
  };

  const isCurrentPlaylistPlaying = currentPlaylist.some(song => 
    playlistData?.songs.some(pSong => pSong.id === song.id)
  );
  
  const canEdit = currentUser && playlistData && currentUser.id === playlistData.createdBy;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      </AppLayout>
    );
  }

  if (error || !playlistData) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-white mb-4">
            {error || 'Playlist not found'}
          </h1>
          <button
            onClick={() => router.push('/playlists')}
            className="text-purple-400 hover:text-purple-300 transition-colors"
          >
            Back to Playlists
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/playlists')}
            className="flex items-center text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            Back to Playlists
          </button>
          
          <div className="flex items-start space-x-6">
            <div className="w-48 h-48 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <MusicalNoteIcon className="w-24 h-24 text-white" />
            </div>
            
            <div className="flex-1">
              <p className="text-sm text-gray-400 uppercase tracking-wide">Playlist</p>
              <h1 className="text-4xl font-bold text-white mb-2">{playlistData.name}</h1>
              {playlistData.description && (
                <p className="text-gray-300 mb-4">{playlistData.description}</p>
              )}
              <div className="flex items-center text-sm text-gray-400 space-x-4">
                <span>{playlistData.songs.length} songs</span>
                <span>{formatDuration(getTotalDuration())}</span>
              </div>
            </div>
          </div>
          
          {/* Play Button */}
          <div className="mt-6">
            <button
              onClick={handlePlayPlaylist}
              disabled={playlistData.songs.length === 0}
              className={`flex items-center space-x-3 px-8 py-3 rounded-full text-white font-semibold transition-colors ${
                playlistData.songs.length === 0
                  ? 'bg-gray-600 cursor-not-allowed'
                  : isCurrentPlaylistPlaying && isPlaying
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {isCurrentPlaylistPlaying && isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6" />
              )}
              <span>
                {isCurrentPlaylistPlaying && isPlaying ? 'Pause' : 'Play'}
              </span>
            </button>
          </div>
        </div>

        {/* Songs List */}
        <div className="bg-gray-800 rounded-xl">
          {playlistData.songs.length === 0 ? (
            <div className="text-center py-12">
              <MusicalNoteIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400 mb-2">No songs in this playlist</h3>
              <p className="text-gray-500">Add some songs to get started!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {/* Header */}
              <div className="px-6 py-4">
                <div className={`grid gap-4 text-sm text-gray-400 uppercase tracking-wide ${canEdit ? 'grid-cols-13' : 'grid-cols-12'}`}>
                  <div className="col-span-1">#</div>
                  <div className="col-span-6">Title</div>
                  <div className="col-span-3">Artist</div>
                  <div className="col-span-1">
                    <ClockIcon className="w-4 h-4" />
                  </div>
                  <div className="col-span-1"></div> {/* Add to Queue column */}
                  {canEdit && <div className="col-span-1"></div>}
                </div>
              </div>
              
              {/* Songs */}
              {playlistData.songs.map((song, index) => {
                const isCurrentSong = currentSong?.id === song.id;
                const isPlayingThisSong = isCurrentSong && isPlaying;
                
                return (
                  <div
                    key={song.id}
                    className={`px-6 py-4 hover:bg-gray-750 transition-colors group ${
                      isCurrentSong ? 'bg-gray-750' : ''
                    }`}
                  >
                    <div className={`grid gap-4 items-center ${canEdit ? 'grid-cols-13' : 'grid-cols-12'}`}>
                      <div className="col-span-1">
                        <button
                          onClick={() => handlePlaySong(index)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors group-hover:opacity-100"
                        >
                          {isPlayingThisSong ? (
                            <PauseIcon className="w-4 h-4 text-green-500" />
                          ) : (
                            <div className="group-hover:hidden">
                              <span className={`text-sm ${isCurrentSong ? 'text-green-500' : ''}`}>
                                {index + 1}
                              </span>
                            </div>
                          )}
                          {!isPlayingThisSong && (
                            <PlayIcon className="w-4 h-4 hidden group-hover:block" />
                          )}
                        </button>
                      </div>
                      
                      <div className="col-span-6 flex items-center space-x-3">
                        <MusicImage
                          src={song.coverUrl}
                          alt={song.title}
                          size="small"
                        />
                        <div>
                          <p className={`font-medium ${isCurrentSong ? 'text-green-500' : 'text-white'}`}>
                            {song.title}
                          </p>
                        </div>
                      </div>
                      
                      <div className="col-span-3">
                        <p className="text-gray-400 text-sm">
                          {getArtistName(song)}
                        </p>
                      </div>
                      
                      <div className="col-span-1">
                        <span className="text-gray-400 text-sm">
                          {formatDuration(song.durationSec)}
                        </span>
                      </div>
                      
                      <div className="col-span-1">
                        <button
                          onClick={() => handleAddToQueue(song)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-purple-400 transition-all"
                          title="Add to queue"
                        >
                          <QueueListIcon className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {canEdit && (
                        <div className="col-span-1">
                          <button
                            onClick={() => handleRemoveSong(song.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition-all"
                            title="Remove from playlist"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

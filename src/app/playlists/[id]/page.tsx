'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MusicImage from '@/components/ui/MusicImage';
import PlaylistCoverUploader from '@/components/PlaylistCoverUploader';
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
  QueueListIcon,
  PencilIcon
} from '@heroicons/react/24/outline';

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params?.id as string;
  
  const [playlistData, setPlaylistData] = useState<Playlist | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', description: '' });
  
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

  const handleUpdatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistData || !editFormData.name.trim()) return;

    try {
      await PlaylistService.updatePlaylist(playlistData.id, {
        name: editFormData.name.trim(),
        description: editFormData.description?.trim() || undefined
      });
      
      // Update local state
      setPlaylistData(prev => prev ? {
        ...prev,
        name: editFormData.name.trim(),
        description: editFormData.description?.trim() || undefined
      } : null);
      
      setShowEditModal(false);
    } catch (error) {
      console.error('Failed to update playlist:', error);
    }
  };

  const handleCoverUpdated = async (newCoverUrl: string | null) => {
    console.log('Cover updated:', newCoverUrl);
    
    // Add cache busting parameter to force image refresh
    const cacheBustedUrl = newCoverUrl ? `${newCoverUrl}&t=${Date.now()}` : null;
    
    // Update local state immediately
    setPlaylistData(prev => {
      if (!prev) return null;
      const updated = { ...prev, coverUrl: cacheBustedUrl || undefined };
      console.log('Updated playlist data with cache busting:', updated);
      return updated;
    });
    
    // Also reload the playlist from server to ensure consistency
    try {
      const refreshedPlaylist = await PlaylistService.getPlaylist(playlistId);
      console.log('Refreshed playlist data from server:', refreshedPlaylist);
      
      // Add cache busting to the refreshed data too
      const finalUrl = refreshedPlaylist.coverUrl ? `${refreshedPlaylist.coverUrl}&t=${Date.now()}` : undefined;
      setPlaylistData({ ...refreshedPlaylist, coverUrl: finalUrl });
    } catch (error) {
      console.error('Failed to refresh playlist data:', error);
    }
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
      <>
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      </>
    );
  }

  if (error || !playlistData) {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
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
            <div className="w-48 h-48 rounded-lg overflow-hidden bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0">
              {playlistData.coverUrl ? (
                <MusicImage 
                  key={playlistData.coverUrl}
                  src={playlistData.coverUrl} 
                  alt={playlistData.name} 
                  size="large"
                  className="w-full h-full object-cover"
                />
              ) : (
                <MusicalNoteIcon className="w-24 h-24 text-white" />
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
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
                {canEdit && (
                  <button
                    onClick={() => {
                      setEditFormData({ 
                        name: playlistData.name, 
                        description: playlistData.description || '' 
                      });
                      setShowEditModal(true);
                    }}
                    className="p-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    title="Edit playlist"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                )}
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

      {/* Edit Modal */}
      {showEditModal && playlistData && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            // Only close if clicking directly on the backdrop, not if event bubbled from children
            if (e.target === e.currentTarget) {
              setShowEditModal(false);
            }
          }}
        >
          <div 
            className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600 rounded-2xl p-8 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <MusicalNoteIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Edit Playlist</h3>
                <p className="text-gray-400">Update your playlist details and cover image</p>
              </div>
            </div>
            
            <form onSubmit={handleUpdatePlaylist} className="space-y-6">
              {/* Cover Image Section */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Cover Image
                </label>
                <PlaylistCoverUploader 
                  key={`${playlistData.id}-${playlistData.coverUrl || 'no-cover'}`}
                  playlistId={playlistData.id}
                  currentCoverUrl={playlistData.coverUrl}
                  onCoverUpdated={handleCoverUpdated}
                />
              </div>

              {/* Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Playlist Name *
                </label>
                <input
                  type="text"
                  placeholder="My Awesome Playlist"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors placeholder-gray-400"
                  required
                />
              </div>

              {/* Description Field */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  placeholder="Describe your playlist..."
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors h-24 resize-none placeholder-gray-400"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  Update Playlist
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 sm:flex-none bg-gray-600 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

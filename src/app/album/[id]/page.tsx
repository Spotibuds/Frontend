"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MusicImage from '@/components/ui/MusicImage';
import SongCard from '@/components/SongCard';
import { musicApi, identityApi, safeString, type Album, type Song, type User } from '@/lib/api';
import { useAudio } from '@/lib/audio';
import { PlayIcon, PauseIcon, QueueListIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [playlists, setPlaylists] = useState<Array<{id: string; name: string; songs: Song[]}>>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const { currentSong, isPlaying, playSong, togglePlayPause, addToQueue, clearQueue } = useAudio();

  // Load current user once on component mount
  useEffect(() => {
    setCurrentUser(identityApi.getCurrentUser());
  }, []);

  useEffect(() => {
    const fetchAlbumData = async () => {
      if (!albumId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Fetch album details and songs in parallel
        const [albumData, albumSongs] = await Promise.allSettled([
          musicApi.getAlbum(albumId),
          musicApi.getAlbumSongs(albumId)
        ]);

        if (albumData.status === 'fulfilled') {
          setAlbum(albumData.value);
        } else {
          console.error('Failed to load album:', albumData.reason);
          setError('Album not found or unavailable');
          return;
        }

        if (albumSongs.status === 'fulfilled') {
          setSongs(albumSongs.value);
        } else {
          console.warn('Failed to load album songs:', albumSongs.reason);
          setSongs([]);
        }
      } catch (error) {
        console.error('Error fetching album data:', error);
        setError('Failed to load album data');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbumData();
  }, [albumId, album?.title]);

  const handleArtistClick = () => {
    if (!album?.artist) return;
    
    // Try to find the artist by name and navigate to their page
    musicApi.getArtists(50).then(artists => { // Limit the search
      const artist = artists.find(a => 
        a.name.toLowerCase() === album.artist?.name.toLowerCase()
      );
      if (artist) {
        router.push(`/artist/${artist.id}`);
      }
    }).catch(error => {
      console.warn('Could not find artist:', error);
    });
  };

  const getTotalDuration = () => {
    const totalSeconds = songs.reduce((acc, song) => acc + (song.durationSec || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
  };

  const formatReleaseDate = (dateString: string) => {
    try {
      return new Date(dateString).getFullYear();
    } catch {
      return dateString;
    }
  };

  // Check if any song from this album is currently playing
  const isCurrentAlbumPlaying = currentSong?.album?.id === album?.id && isPlaying;

  const handlePlayAlbum = () => {
    if (songs.length === 0) return;

    // If current album is playing, just toggle play/pause
    if (isCurrentAlbumPlaying) {
      togglePlayPause();
      return;
    }

    // Clear the current queue and start playing the album
    clearQueue();
    const firstSong = songs[0];
    playSong(firstSong, songs);
  };

  const handleAddToQueue = () => {
    if (songs.length === 0) return;
    addToQueue(songs);
  };

  const handleAddAlbumToPlaylist = async (playlistId: string) => {
    try {
      setAddingToPlaylist(playlistId);
      // Add each song to the playlist
      const { PlaylistService } = await import('@/lib/playlist');
      for (const song of songs) {
        await PlaylistService.addSongToPlaylist(playlistId, song.id);
      }
      setShowAddToPlaylist(false);
      // Show success feedback
      setTimeout(() => setAddingToPlaylist(null), 1000);
    } catch (error) {
      console.error('Failed to add album to playlist:', error);
      setAddingToPlaylist(null);
    }
  };

  const loadPlaylists = useCallback(async () => {
    console.log('loadPlaylists called, currentUser:', currentUser);
    
    if (!currentUser) {
      console.log('No current user, cannot load playlists');
      setPlaylistsLoading(false);
      return;
    }
    
    try {
      setPlaylistsLoading(true);
      console.log('Loading playlists for user ID:', currentUser.id);
      
      const { PlaylistService } = await import('@/lib/playlist');
      const userPlaylists = await PlaylistService.getUserPlaylists(currentUser.id);
      
      console.log('Loaded playlists:', userPlaylists);
      setPlaylists(userPlaylists);
    } catch (error) {
      console.error('Failed to load playlists:', error);
    } finally {
      setPlaylistsLoading(false);
    }
  }, [currentUser]);

  // Load playlists when modal opens
  React.useEffect(() => {
    if (showAddToPlaylist && currentUser?.id) {
      loadPlaylists();
    }
  }, [showAddToPlaylist, currentUser?.id, loadPlaylists]);

  if (loading) {
    return (
      <>
        <div className="p-4 sm:p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading album...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !album) {
    return (
      <>
        <div className="p-4 sm:p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Album not found'}</p>
            <button 
              onClick={() => router.back()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
            >
              Go Back
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        {/* Header */}
  <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center sm:justify-start space-y-4 sm:space-y-0 sm:space-x-6 mb-8">
          {/* Album Cover */}
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <MusicImage
              src={album.coverUrl}
              alt={safeString(album.title)}
              fallbackText={safeString(album.title)}
              size="large"
              type="square"
              className="shadow-2xl sm:w-48 sm:h-48 w-32 h-32"
              priority={true}
              lazy={false}
            />
          </div>

          {/* Album Info */}
          <div className="w-full sm:flex-1 min-w-0 text-center sm:text-left">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2 text-center sm:text-left">Album</p>
            <h1 className="text-2xl sm:text-4xl font-bold text-white mb-4 break-words text-center sm:text-left">{safeString(album.title)}</h1>
            
            <div className="flex flex-wrap justify-center sm:justify-start items-center space-x-2 text-gray-300 mb-4 text-center sm:text-left">
              {album.artist && (
                <>
                  <button 
                    onClick={handleArtistClick}
                    className="font-medium hover:underline hover:text-white transition-colors"
                  >
                    {safeString(album.artist)}
                  </button>
                  <span>•</span>
                </>
              )}
              {album.releaseDate && (
                <>
                  <span>{formatReleaseDate(album.releaseDate)}</span>
                  <span>•</span>
                </>
              )}
              <span>{songs.length} songs</span>
              {songs.length > 0 && (
                <>
                  <span>•</span>
                  <span>{getTotalDuration()}</span>
                </>
              )}
            </div>

            {/* Album Controls */}
            {songs.length > 0 && (
              <div className="flex items-center justify-center sm:justify-start space-x-4">
                {/* Play/Pause Button */}
                <button
                  onClick={handlePlayAlbum}
                  className="bg-green-500 hover:bg-green-400 text-white rounded-full p-3 sm:p-4 transition-all duration-200 hover:scale-105 flex items-center justify-center"
                  title={isCurrentAlbumPlaying ? 'Pause album' : 'Play album'}
                >
                  {isCurrentAlbumPlaying ? (
                    <PauseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" />
                  )}
                </button>

                {/* Add to Queue Button */}
                <button
                  onClick={handleAddToQueue}
                  className="border border-gray-400 hover:border-white text-gray-300 hover:text-white rounded-full p-2 sm:p-3 transition-all duration-200 hover:scale-105 flex items-center justify-center"
                  title="Add album to queue"
                >
                  <QueueListIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Add to Playlist Button */}
                <button
                  onClick={() => {
                    console.log('Add to playlist clicked, currentUser:', currentUser);
                    setShowAddToPlaylist(true);
                  }}
                  className="border border-gray-400 hover:border-white text-gray-300 hover:text-white rounded-full p-2 sm:p-3 transition-all duration-200 hover:scale-105 flex items-center justify-center"
                  title="Add album to playlist"
                >
                  <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            )}
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
            <p className="text-gray-400 mb-4">No songs found for this album</p>
            <p className="text-gray-500 text-sm">This might be a data issue. Try refreshing the page.</p>
          </div>
        )}

        {/* Add to Playlist Modal */}
        {showAddToPlaylist && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-4 sm:p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-white">Add Album to Playlist</h3>
                <button
                  onClick={() => setShowAddToPlaylist(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              
              {!currentUser ? (
                <div className="p-4 text-center">
                  <p className="text-red-400 mb-3 text-sm sm:text-base">You need to be logged in to add songs to playlists</p>
                  <button
                    onClick={() => {
                      setShowAddToPlaylist(false);
                      router.push('/auth/login');
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm sm:text-base"
                  >
                    Log In
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-gray-700 rounded">
                    <p className="text-sm text-gray-300 mb-1">You&apos;re adding:</p>
                    <p className="text-white font-semibold text-sm sm:text-base">{album?.title}</p>
                    <p className="text-gray-400 text-sm">{songs.length} songs</p>
                  </div>

                  {songs.length > 0 && (
                    <div className="max-h-60 overflow-y-auto">
                      {playlistsLoading ? (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                        </div>
                      ) : playlists.length === 0 ? (
                        <div className="p-4 text-gray-400 text-center text-sm sm:text-base">
                          <p>No playlists found</p>
                          <p className="text-sm">Create a playlist first</p>
                        </div>
                      ) : (
                        playlists.map((playlist) => {
                          const isAdding = addingToPlaylist === playlist.id;
                          
                          return (
                            <button
                              key={playlist.id}
                              onClick={() => !isAdding && handleAddAlbumToPlaylist(playlist.id)}
                              disabled={isAdding}
                              className="w-full p-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between rounded-lg"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-white font-medium truncate text-sm sm:text-base">
                                  {playlist.name}
                                </div>
                                <div className="text-gray-400 text-sm">
                                  {playlist.songs.length} songs
                                </div>
                              </div>
                              
                              <div className="flex-shrink-0 ml-3">
                                {isAdding ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                                ) : (
                                  <PlusIcon className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
} 
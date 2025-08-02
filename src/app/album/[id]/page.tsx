"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';

import MusicImage from '@/components/ui/MusicImage';
import { musicApi, processArtists, safeString, type Album, type Song } from '@/lib/api';
import { useAudio } from '@/lib/audio';

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playSong, state } = useAudio();
  const { currentSong } = state;

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
          // If specific album endpoint fails, try to find it from all albums
          try {
            const allAlbums = await musicApi.getAlbums();
            const foundAlbum = allAlbums.find(a => a.id === albumId);
            if (foundAlbum) {
              setAlbum(foundAlbum);
            } else {
              setError('Album not found');
              return;
            }
          } catch {
            setError('Failed to load album');
            return;
          }
        }

        if (albumSongs.status === 'fulfilled') {
          setSongs(albumSongs.value);
        } else {
          // If specific album songs endpoint fails, try to find songs from all songs
          try {
            const allSongs = await musicApi.getSongs();
            const albumSpecificSongs = allSongs.filter(song => 
              song.album === albumId || 
              (song.album && song.album === album?.title)
            );
            setSongs(albumSpecificSongs);
          } catch {
            console.warn('Failed to load album songs');
            setSongs([]);
          }
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
    musicApi.getArtists().then(artists => {
      const artist = artists.find(a => 
        a.name.toLowerCase() === album.artist.toLowerCase()
      );
      if (artist) {
        router.push(`/artist/${artist.id}`);
      }
    }).catch(error => {
      console.warn('Could not find artist:', error);
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading album...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !album) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
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
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start space-x-6 mb-8">
          {/* Album Cover */}
          <div className="flex-shrink-0">
            <MusicImage
              src={album.coverUrl}
              alt={safeString(album.title)}
              fallbackText={safeString(album.title)}
              size="xl"
              type="square"
              className="shadow-2xl"
              priority={true}
              lazy={false}
            />
          </div>

          {/* Album Info */}
          <div className="flex-1 min-w-0 pt-4">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">Album</p>
            <h1 className="text-4xl font-bold text-white mb-4 break-words">{safeString(album.title)}</h1>
            
            <div className="flex items-center space-x-2 text-gray-300 mb-4">
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

            {/* Play Button */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => songs.length > 0 && playSong(songs[0])}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-full transition-colors duration-200 flex items-center space-x-2"
                disabled={songs.length === 0}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Play</span>
              </button>
            </div>
          </div>
        </div>

        {/* Songs List */}
        {songs.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-gray-400 text-sm font-medium border-b border-gray-800">
              <div className="col-span-1">#</div>
              <div className="col-span-6">Title</div>
              <div className="col-span-3">Artist</div>
              <div className="col-span-2 text-right">Duration</div>
            </div>
            
            {songs.map((song, index) => (
              <div
                key={song.id}
                onClick={() => playSong(song)}
                className={`grid grid-cols-12 gap-4 px-4 py-3 rounded-lg hover:bg-gray-800/50 cursor-pointer transition-colors group ${
                  currentSong?.id === song.id ? 'bg-purple-900/30' : ''
                }`}
              >
                <div className="col-span-1 flex items-center">
                  <span className={`text-sm ${currentSong?.id === song.id ? 'text-purple-400' : 'text-gray-400'}`}>
                    {index + 1}
                  </span>
                </div>
                
                <div className="col-span-6 flex items-center space-x-3">
                  <MusicImage
                    src={song.coverUrl}
                    alt={safeString(song.title)}
                    fallbackText={safeString(song.title)}
                    size="small"
                    type="square"
                    priority={index < 5}
                    lazy={index >= 5}
                  />
                  <div className="min-w-0">
                    <h3 className={`font-medium truncate ${currentSong?.id === song.id ? 'text-purple-400' : 'text-white'}`}>
                      {safeString(song.title)}
                    </h3>
                    <p className="text-gray-400 text-sm truncate">{safeString(song.genre)}</p>
                  </div>
                </div>
                
                <div className="col-span-3 flex items-center">
                  <span className="text-gray-300 truncate">
                    {processArtists(song.artists).join(', ')}
                  </span>
                </div>
                
                <div className="col-span-2 flex items-center justify-end">
                  <span className="text-gray-400">{formatDuration(song.durationSec)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No songs found for this album</p>
            <p className="text-gray-500 text-sm">This might be a data issue. Try refreshing the page.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
} 
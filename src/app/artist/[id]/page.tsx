"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';

import MusicImage from '@/components/ui/MusicImage';
import { musicApi, processArtists, safeString, type Artist, type Album, type Song } from '@/lib/api';
import { useAudio } from '@/lib/audio';
import MusicalNoteIcon from '@heroicons/react/24/outline/MusicalNoteIcon';
import Square3Stack3DIcon from '@heroicons/react/24/outline/Square3Stack3DIcon';

export default function ArtistPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playSong } = useAudio();

  useEffect(() => {
    const fetchArtistData = async () => {
      if (!artistId) return;

      try {
        setLoading(true);
        setError(null);
        let artistData: Artist | null = null;
        
        try {
          artistData = await musicApi.getArtist(artistId);
        } catch {
          try {
            const allArtists = await musicApi.getArtists();
            artistData = allArtists.find(a => a.id === artistId) || null;
          } catch (e) {
            console.error('Failed to get artists list:', e);
          }
        }

        if (!artistData) {
          console.warn('Artist not found:', artistId);
          setError('Artist not found');
          return;
        }

        setArtist(artistData);

        const [allAlbums, allSongs] = await Promise.allSettled([
          musicApi.getAlbums(),
          musicApi.getSongs()
        ]);

        if (allAlbums.status === 'fulfilled') {
          const artistAlbums = allAlbums.value.filter(album => {
            const albumArtist = safeString(album.artist).toLowerCase();
            const targetName = safeString(artistData.name).toLowerCase();
            return albumArtist === targetName || albumArtist.includes(targetName);
          });
          setAlbums(artistAlbums);
        } else {
          console.warn('Failed to load albums:', allAlbums.reason);
        }

        if (allSongs.status === 'fulfilled') {
          const artistSongs = allSongs.value.filter(song => {
            const artists = processArtists(song.artists);
            const targetName = safeString(artistData.name).toLowerCase();
            return artists.some(artist => 
              safeString(artist).toLowerCase() === targetName ||
              safeString(artist).toLowerCase().includes(targetName)
            );
          });
          setSongs(artistSongs);
        } else {
          console.warn('Failed to load songs:', allSongs.reason);
        }

      } catch (error) {
        console.error('Error fetching artist data:', error);
        setError('Failed to load artist data. Please check if the music service is running.');
      } finally {
        setLoading(false);
      }
    };

    fetchArtistData();
  }, [artistId]);

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading artist...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !artist) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Artist not found'}</p>
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
      <div className="min-h-screen">
        {/* Artist Hero Section */}
        <div className="relative bg-gradient-to-b from-purple-900/20 via-gray-900/50 to-gray-900">
          <div className="max-w-7xl mx-auto px-6 pt-8 pb-12">
            <div className="flex flex-col lg:flex-row items-start lg:items-end gap-8">
              {/* Artist Image */}
              <div className="flex-shrink-0">
                <MusicImage
                  src={artist.imageUrl}
                  alt={safeString(artist.name)}
                  fallbackText={safeString(artist.name)}
                  size="xl"
                  type="circle"
                  className="shadow-2xl w-64 h-64 mx-auto lg:mx-0"
                  priority={true}
                  lazy={false}
                />
              </div>
              
              {/* Artist Info */}
              <div className="flex-1 text-center lg:text-left">
                <p className="text-sm font-medium text-purple-400 uppercase tracking-wide mb-2">
                  Artist
                </p>
                <h1 className="text-5xl lg:text-7xl font-bold text-white mb-4 break-words">
                  {safeString(artist.name)}
                </h1>
                
                {/* Stats */}
                <div className="flex items-center justify-center lg:justify-start space-x-6 mb-6 text-gray-300">
                  <span className="flex items-center space-x-2">
                    <MusicalNoteIcon className="w-5 h-5" />
                    <span>{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
                  </span>
                  <span className="flex items-center space-x-2">
                    <Square3Stack3DIcon className="w-5 h-5" />
                    <span>{albums.length} album{albums.length !== 1 ? 's' : ''}</span>
                  </span>
                </div>

                {/* Bio */}
                {artist.bio && (
                  <p className="text-gray-300 text-lg max-w-2xl leading-relaxed">
                    {safeString(artist.bio)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
          
          {/* Popular Songs */}
          {songs.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold text-white mb-6">Popular Songs</h2>
              <div className="space-y-2">
                {songs.slice(0, 10).map((song, index) => (
                  <div 
                    key={song.id}
                    onClick={() => playSong(song)}
                    className="group flex items-center p-4 rounded-lg hover:bg-gray-800/50 cursor-pointer transition-all duration-200"
                  >
                    <span className="text-gray-400 text-lg font-medium mr-6 w-8 text-center group-hover:text-white">
                      {index + 1}
                    </span>
                    
                    <div className="flex-shrink-0 mr-4">
                      <MusicImage
                        src={song.coverUrl}
                        alt={safeString(song.title)}
                        fallbackText={safeString(song.title)}
                        size="medium"
                        type="square"
                        className="shadow-md"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate group-hover:underline mb-1">
                        {safeString(song.title)}
                      </h3>
                      <p className="text-gray-400 text-sm truncate">
                        {processArtists(song.artists).join(', ')}
                      </p>
                      {song.album && (
                        <p className="text-gray-500 text-xs truncate">
                          {safeString(song.album)}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-gray-400 text-sm text-right">
                      <p>{formatDuration(song.durationSec)}</p>
                      {song.genre && (
                        <p className="text-xs text-gray-500">{safeString(song.genre)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {albums.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold text-white mb-6">Albums</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {albums.map((album) => (
                  <div 
                    key={album.id} 
                    onClick={() => handleAlbumClick(album.id)}
                    className="group cursor-pointer"
                  >
                    <div className="mb-4 group-hover:shadow-2xl transition-shadow duration-200">
                      <MusicImage
                        src={album.coverUrl}
                        alt={safeString(album.title)}
                        fallbackText={safeString(album.title)}
                        size="large"
                        type="square"
                        className="shadow-lg w-full"
                      />
                    </div>
                    <h3 className="text-white font-semibold text-sm mb-1 truncate group-hover:underline">
                      {safeString(album.title)}
                    </h3>
                    <p className="text-gray-400 text-xs truncate">
                      {album.releaseDate ? new Date(album.releaseDate).getFullYear() : 'Album'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {songs.length === 0 && albums.length === 0 && (
            <div className="text-center py-16">
              <div className="text-gray-600 text-6xl mb-4">♪</div>
              <p className="text-gray-400 text-lg mb-2">No content available</p>
              <p className="text-gray-500">This artist hasn&apos;t released any music yet.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
} 
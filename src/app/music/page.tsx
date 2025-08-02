"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import Slider from '@/components/ui/Slider';
import MusicImage from '@/components/ui/MusicImage';
import { musicApi, processArtists, safeString, type Song, type Album, type Artist } from '@/lib/api';
import { useAudio } from '@/lib/audio';

export default function MusicPage() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playSong } = useAudio();

  useEffect(() => {
    const fetchMusicData = async () => {
      try {
        setError(null);
        
        const [songsResult, albumsResult, artistsResult] = await Promise.allSettled([
          musicApi.getSongs(),
          musicApi.getAlbums(),
          musicApi.getArtists(),
        ]);

        if (songsResult.status === 'fulfilled') {
          setSongs(songsResult.value || []);
        } else {
          console.warn('Failed to load songs:', songsResult.reason);
        }

        if (albumsResult.status === 'fulfilled') {
          setAlbums(albumsResult.value || []);
        } else {
          console.warn('Failed to load albums:', albumsResult.reason);
        }

        if (artistsResult.status === 'fulfilled') {
          setArtists(artistsResult.value || []);
        } else {
          console.warn('Failed to load artists:', artistsResult.reason);
        }
      } catch (error) {
        console.error('Error fetching music data:', error);
        setError('Failed to load music data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchMusicData();
  }, []);

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`);
  };

  const handleArtistClick = async (artist: Artist) => {
    router.push(`/artist/${artist.id}`);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };



  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-8">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading music...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-6 space-y-8">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
            >
              Retry
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-8">

        {/* Albums Section */}
        {albums.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Albums</h2>
              <button className="text-gray-400 hover:text-white text-sm font-medium transition-colors">
                Show all
              </button>
            </div>
            
            <Slider itemWidth="180px" gap="16px">
              {albums.map((album, index) => (
                <div 
                  key={album.id} 
                  onClick={() => handleAlbumClick(album.id)}
                  className="group cursor-pointer p-4 rounded-lg hover:bg-gray-800/30 transition-all duration-200"
                >
                  <div className="mb-4 group-hover:shadow-2xl transition-shadow duration-200">
                    <MusicImage
                      src={album.coverUrl}
                      alt={safeString(album.title)}
                      fallbackText={safeString(album.title)}
                      size="large"
                      type="square"
                      className="shadow-lg"
                      priority={index < 6}
                    />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1 truncate group-hover:underline">
                    {safeString(album.title)}
                  </h3>
                  <p className="text-gray-400 text-xs truncate">
                    {safeString(album.artist) || 'Unknown Artist'}
                  </p>
                </div>
              ))}
            </Slider>
          </section>
        )}

        {/* Artists Section */}
        {artists.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Artists</h2>
              <button className="text-gray-400 hover:text-white text-sm font-medium transition-colors">
                Show all
              </button>
            </div>
            
            <Slider itemWidth="160px" gap="16px">
              {artists.map((artist, index) => (
                <div 
                  key={artist.id} 
                  onClick={() => handleArtistClick(artist)}
                  className="group cursor-pointer p-4 rounded-lg hover:bg-gray-800/30 transition-all duration-200"
                >
                  <div className="mb-4 group-hover:shadow-2xl transition-shadow duration-200">
                    <MusicImage
                      src={artist.imageUrl}
                      alt={safeString(artist.name)}
                      fallbackText={safeString(artist.name)}
                      size="large"
                      type="circle"
                      className="shadow-lg"
                      priority={index < 6}
                    />
                  </div>
                  <h3 className="text-white font-semibold text-sm text-center truncate group-hover:underline">
                    {safeString(artist.name)}
                  </h3>
                </div>
              ))}
            </Slider>
          </section>
        )}

        {/* Popular Songs Section */}
        {songs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Popular Songs</h2>
              <button className="text-gray-400 hover:text-white text-sm font-medium transition-colors">
                Show all
              </button>
            </div>
            
            <Slider itemWidth="280px" gap="16px">
              {songs.map((song) => (
                <div 
                  key={song.id}
                  onClick={() => playSong(song)}
                  className="group cursor-pointer p-4 rounded-lg hover:bg-gray-800/30 transition-all duration-200"
                >
                  <div className="flex items-center space-x-3">
                    <MusicImage
                      src={song.coverUrl}
                      alt={safeString(song.title)}
                      fallbackText={safeString(song.title)}
                      size="medium"
                      type="square"
                      className="shadow-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate group-hover:underline">
                        {safeString(song.title)}
                      </h3>
                      <p className="text-gray-400 text-sm truncate">
                        {processArtists(song.artists).join(', ')}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {formatDuration(song.durationSec)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </Slider>
          </section>
        )}

        {/* Empty state */}
        {albums.length === 0 && artists.length === 0 && songs.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No music content available</p>
            <p className="text-gray-500 text-sm">Check back later or contact support if this persists</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
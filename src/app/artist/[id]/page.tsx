"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MusicImage from '@/components/ui/MusicImage';
import SongCard from '@/components/SongCard';
import AlbumPlayButton from '@/components/ui/AlbumPlayButton';
import { musicApi, safeString, type Artist, type Album, type Song } from '@/lib/api';
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
          console.error('Failed to load artist - artist not found');
          setError('Artist not found');
          return;
        }

        if (!artistData) {
          console.warn('Artist not found:', artistId);
          setError('Artist not found');
          return;
        }

        setArtist(artistData);

        // Use the new efficient endpoints for artist-specific data
        const [albumsResult, songsResult] = await Promise.allSettled([
          musicApi.getArtistAlbums(artistId, 20),
          musicApi.getArtistSongs(artistId, 30)
        ]);

        if (albumsResult.status === 'fulfilled') {
          setAlbums(albumsResult.value);
        } else {
          console.warn('Failed to load artist albums:', albumsResult.reason);
        }

        if (songsResult.status === 'fulfilled') {
          setSongs(songsResult.value);
        } else {
          console.warn('Failed to load artist songs:', songsResult.reason);
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

  if (loading) {
    return (
      <>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading artist...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !artist) {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
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
                  <SongCard 
                    key={song.id} 
                    song={song}
                    index={index}
                    showDuration={true}
                    showAddToPlaylist={true}
                    showAddToQueue={true}
                  />
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
                    className="group cursor-pointer relative"
                  >
                    <div className="mb-4 group-hover:shadow-2xl transition-shadow duration-200 relative">
                      <MusicImage
                        src={album.coverUrl}
                        alt={safeString(album.title)}
                        fallbackText={safeString(album.title)}
                        size="large"
                        type="square"
                        className="shadow-lg w-full"
                      />
                      {/* Play button overlay */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <AlbumPlayButton 
                          album={album} 
                          size="large" 
                          showAddToQueue={true}
                        />
                      </div>
                    </div>
                    <div onClick={() => handleAlbumClick(album.id)}>
                      <h3 className="text-white font-semibold text-sm mb-1 truncate group-hover:underline">
                        {safeString(album.title)}
                      </h3>
                      <p className="text-gray-400 text-xs truncate">
                        {album.releaseDate ? new Date(album.releaseDate).getFullYear() : 'Album'}
                      </p>
                    </div>
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
    </>
  );
} 
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import Slider from '@/components/ui/Slider';
import MusicImage from '@/components/ui/MusicImage';
import { musicApi, type Artist, type Album, type Song } from '@/lib/api';
import { useAudio } from '@/lib/audio';

export default function ArtistPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const { playSong } = useAudio();

  useEffect(() => {
    const fetchArtistData = async () => {
      try {
        const [artistData, allAlbums, allSongs] = await Promise.all([
          musicApi.getArtist(artistId),
          musicApi.getAlbums(),
          musicApi.getSongs(),
        ]);

        setArtist(artistData);
        
        // Filter albums by this artist
        const artistAlbums = allAlbums.filter(album => album.artist?.id === artistId);
        setAlbums(artistAlbums);

        // Filter songs by this artist
        const artistSongs = allSongs.filter(song => 
          song.artists.some(songArtist => songArtist.id === artistId)
        );
        setSongs(artistSongs);

      } catch (error) {
        console.error('Error fetching artist data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (artistId) {
      fetchArtistData();
    }
  }, [artistId]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSongClick = (song: Song) => {
    if (song.fileUrl) {
      playSong(song);
    }
  };

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-500"></div>
        </div>
      </AppLayout>
    );
  }

  if (!artist) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Artist not found</h1>
            <button 
              onClick={() => router.back()}
              className="text-purple-400 hover:text-purple-300"
            >
              Go back
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
          {/* Artist Image */}
          <div className="flex-shrink-0">
            <MusicImage
              src={artist.imageUrl}
              alt={artist.name}
              fallbackText={artist.name}
              size="xl"
              type="circle"
              className="shadow-2xl"
              priority={true}
              lazy={false}
            />
          </div>

          {/* Artist Info */}
          <div className="flex-1 min-w-0 pt-4">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">Artist</p>
            <h1 className="text-4xl font-bold text-white mb-4 break-words">{artist.name}</h1>
            
            <div className="flex items-center space-x-2 text-gray-300 mb-6">
              <span>{albums.length} albums</span>
              <span>•</span>
              <span>{songs.length} songs</span>
            </div>

            {/* Play Button */}
            {songs.length > 0 && (
              <button
                onClick={() => handleSongClick(songs[0])}
                className="bg-purple-500 hover:bg-purple-600 text-white px-8 py-3 rounded-full font-medium transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Play</span>
              </button>
            )}
          </div>
        </div>

        {/* Bio Section */}
        {artist.bio && (
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">About</h2>
            <p className="text-gray-300 leading-relaxed max-w-3xl">{artist.bio}</p>
          </section>
        )}

        {/* Albums Section */}
        {albums.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Albums</h2>
            
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
                      alt={album.title}
                      fallbackText={album.title}
                      size="large"
                      type="square"
                      className="shadow-lg"
                      priority={index < 3}
                      lazy={index >= 3}
                      loadDelay={index >= 3 ? index * 100 : 0}
                    />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1 truncate group-hover:underline">{album.title}</h3>
                  <p className="text-gray-400 text-xs truncate">
                    {album.releaseDate ? new Date(album.releaseDate).getFullYear() : 'Unknown year'}
                  </p>
                </div>
              ))}
            </Slider>
          </section>
        )}

        {/* Popular Songs Section */}
        {songs.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6">Popular Songs</h2>
            
            <div className="space-y-2">
              {songs.slice(0, 10).map((song, index) => (
                <div
                  key={song.id}
                  onClick={() => handleSongClick(song)}
                  className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-800/30 cursor-pointer transition-colors group"
                >
                  <span className="text-gray-400 text-sm w-6 text-center group-hover:hidden">
                    {index + 1}
                  </span>
                  <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 hidden group-hover:block" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  
                  <MusicImage
                    src={song.coverUrl}
                    alt={song.title}
                    fallbackText={song.title}
                    size="small"
                    type="square"
                    priority={index < 3}
                    lazy={index >= 3}
                    loadDelay={index >= 3 ? (index - 2) * 150 : 0}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate group-hover:underline">{song.title}</h3>
                    <p className="text-gray-400 text-sm truncate">
                      {song.album?.title || 'Single'} • {song.genre}
                    </p>
                  </div>
                  
                  <div className="text-gray-400 text-sm">
                    {formatDuration(song.durationSec)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {albums.length === 0 && songs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">This artist has no albums or songs.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
} 
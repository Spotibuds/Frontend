"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import MusicImage from '@/components/ui/MusicImage';
import { musicApi, type Album, type Song } from '@/lib/api';
import { useAudio } from '@/lib/audio';

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const { playSong, currentSong, isPlaying } = useAudio();

  useEffect(() => {
    const fetchAlbumData = async () => {
      try {
        const [albumData, songsData] = await Promise.all([
          musicApi.getAlbum(albumId),
          musicApi.getAlbumSongs(albumId),
        ]);

        setAlbum(albumData);
        setSongs(songsData);
      } catch (error) {
        console.error('Error fetching album data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (albumId) {
      fetchAlbumData();
    }
  }, [albumId]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getTotalDuration = () => {
    const total = songs.reduce((acc, song) => acc + song.durationSec, 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatReleaseDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).getFullYear().toString();
  };

  const handleSongClick = (song: Song) => {
    if (song.fileUrl) {
      playSong(song);
    }
  };

  const handleArtistClick = () => {
    if (album?.artist?.id) {
      router.push(`/artist/${album.artist.id}`);
    }
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

  if (!album) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Album not found</h1>
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
          {/* Album Cover */}
          <div className="flex-shrink-0">
            <MusicImage
              src={album.coverUrl}
              alt={album.title}
              fallbackText={album.title}
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
            <h1 className="text-4xl font-bold text-white mb-4 break-words">{album.title}</h1>
            
            <div className="flex items-center space-x-2 text-gray-300 mb-4">
              {album.artist && (
                <>
                  <button 
                    onClick={handleArtistClick}
                    className="font-medium hover:underline hover:text-white transition-colors"
                  >
                    {album.artist.name}
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
              <span>•</span>
              <span>{getTotalDuration()}</span>
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

        {/* Songs List */}
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-4 text-gray-400 text-sm font-medium border-b border-gray-800 pb-2 mb-2">
            <div className="col-span-1">#</div>
            <div className="col-span-6">Title</div>
            <div className="col-span-3">Artist</div>
            <div className="col-span-2 text-right">Duration</div>
          </div>

          {songs.map((song, index) => (
            <div
              key={song.id}
              onClick={() => handleSongClick(song)}
              className={`grid grid-cols-12 gap-4 py-2 px-2 rounded-md cursor-pointer transition-colors group hover:bg-gray-800/30 ${
                currentSong?.id === song.id ? 'bg-gray-800/50' : ''
              }`}
            >
              <div className="col-span-1 flex items-center">
                {currentSong?.id === song.id && isPlaying ? (
                  <div className="flex items-center space-x-1">
                    <div className="w-1 h-3 bg-purple-400 animate-pulse"></div>
                    <div className="w-1 h-2 bg-purple-400 animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1 h-3 bg-purple-400 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                ) : (
                  <span className="text-gray-400 group-hover:hidden">{index + 1}</span>
                )}
                <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 hidden group-hover:block" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              
              <div className="col-span-6 flex items-center space-x-3">
                <MusicImage
                  src={song.coverUrl}
                  alt={song.title}
                  fallbackText={song.title}
                  size="small"
                  type="square"
                  priority={index < 5}
                  lazy={index >= 5}
                  loadDelay={index >= 5 ? (index - 4) * 100 : 0}
                />
                <div className="min-w-0">
                  <h3 className={`font-medium truncate ${currentSong?.id === song.id ? 'text-purple-400' : 'text-white'}`}>
                    {song.title}
                  </h3>
                  <p className="text-gray-400 text-sm truncate">{song.genre}</p>
                </div>
              </div>
              
              <div className="col-span-3 flex items-center">
                <span className="text-gray-300 truncate">
                  {song.artists.map(a => a.name).join(', ') || 'Unknown Artist'}
                </span>
              </div>
              
              <div className="col-span-2 flex items-center justify-end">
                <span className="text-gray-400">{formatDuration(song.durationSec)}</span>
              </div>
            </div>
          ))}
        </div>

        {songs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">This album has no songs.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
} 
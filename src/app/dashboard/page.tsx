"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import Slider from '@/components/ui/Slider';
import MusicImage from '@/components/ui/MusicImage';
import { identityApi, musicApi, processArtists, safeString, type User, type Song, type Album, type Artist } from "@/lib/api";
import { useAudio } from '@/lib/audio';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playSong } = useAudio();

  useEffect(() => {
    const currentUser = identityApi.getCurrentUser();
    if (!currentUser) {
      router.push("/");
      return;
    }

    setUser(currentUser);

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
        }
        if (albumsResult.status === 'fulfilled') {
          setAlbums(albumsResult.value || []);
        }
        if (artistsResult.status === 'fulfilled') {
          setArtists(artistsResult.value || []);
        }

        if (songsResult.status === 'rejected') {
          console.warn('Music service unavailable - some features may be limited');
        }
        if (albumsResult.status === 'rejected') {
          console.warn('Albums unavailable - check if Music service is running');
        }
        if (artistsResult.status === 'rejected') {
          console.warn('Artists unavailable - check if Music service is running');
        }
      } catch (error) {
        console.error('Error fetching music data:', error);
        setError('Failed to load music data. Some features may be limited.');
      } finally {
        setLoading(false);
      }
    };

    fetchMusicData();
  }, [router]);

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`);
  };

  const handleArtistClick = (artistId: string) => {
    router.push(`/artist/${artistId}`);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 px-6 pt-8 pb-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              {/* Welcome Message */}
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-white mb-2">
                  {getGreeting()}, {safeString(user.username)}!
                </h1>
                <p className="text-gray-300 text-lg">
                  {loading ? 'Loading your music...' : 'Welcome back to SpotiBuds'}
                </p>
                {error && (
                  <p className="text-yellow-400 text-sm mt-2">{error}</p>
                )}
              </div>

              {/* User Profile Card */}
              <div className="hidden lg:block bg-black/20 backdrop-blur-sm rounded-lg p-6 min-w-[300px]">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xl">
                      {safeString(user.username).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg">{safeString(user.username)}</h3>
                    <p className="text-gray-300 text-sm">SpotiBuds Member</p>
                    <button 
                      onClick={() => router.push('/user')}
                      className="text-purple-400 hover:text-purple-300 text-sm font-medium mt-1"
                    >
                      View Profile →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-6 py-8 space-y-12">
          <div className="max-w-7xl mx-auto">
            {/* Featured Albums */}
            {albums.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Featured Albums</h2>
                  <button 
                    onClick={() => router.push('/music')}
                    className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
                  >
                    View all →
                  </button>
                </div>
                
                <Slider itemWidth="200px" gap="20px">
                  {albums.slice(0, 10).map((album, index) => (
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

            {/* Featured Artists */}
            {artists.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Featured Artists</h2>
                  <button 
                    onClick={() => router.push('/music')}
                    className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
                  >
                    View all →
                  </button>
                </div>
                
                <Slider itemWidth="180px" gap="20px">
                  {artists.slice(0, 8).map((artist, index) => (
                    <div 
                      key={artist.id} 
                      onClick={() => handleArtistClick(artist.id)}
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
                      <p className="text-gray-400 text-xs text-center">Artist</p>
                    </div>
                  ))}
                </Slider>
              </section>
            )}

            {/* Popular Songs */}
            {songs.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Popular Right Now</h2>
                  <button 
                    onClick={() => router.push('/music')}
                    className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
                  >
                    View all →
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {songs.slice(0, 8).map((song) => (
                    <div 
                      key={song.id}
                      onClick={() => playSong(song)}
                      className="group cursor-pointer p-4 rounded-lg hover:bg-gray-800/50 transition-all duration-200"
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
                </div>
              </section>
            )}

            {/* Loading state for music sections */}
            {loading && (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading your music...</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && albums.length === 0 && artists.length === 0 && songs.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-600 text-6xl mb-4">♪</div>
                <p className="text-gray-400 mb-4">No music content available yet</p>
                <p className="text-gray-500 text-sm">Discover music to see personalized recommendations</p>
                <button
                  onClick={() => router.push('/music')}
                  className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-full transition-colors"
                >
                  Browse Music
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
} 
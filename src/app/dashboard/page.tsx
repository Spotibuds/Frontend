"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Slider from "@/components/ui/Slider";
import MusicImage from "@/components/ui/MusicImage";
import { identityApi, musicApi, type User, type Song, type Album, type Artist } from "@/lib/api";
import { useAudio } from "@/lib/audio";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
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
        const [songsData, albumsData, artistsData] = await Promise.all([
          musicApi.getSongs(),
          musicApi.getAlbums(),
          musicApi.getArtists(),
        ]);

        setSongs(songsData);
        setAlbums(albumsData);
        setArtists(artistsData);
      } catch (error) {
        console.error('Error fetching music data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMusicData();
  }, [router]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSongClick = (song: Song) => {
    if (song.fileUrl) {
      playSong(song);
    } else {
      console.warn('Song has no file URL:', song.title);
    }
  };

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`);
  };

  const handleArtistClick = (artistId: string) => {
    router.push(`/artist/${artistId}`);
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

  if (!user) {
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user.username}!
          </h1>
        </div>

        {/* Recent Albums Section */}
        {albums.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recent albums</h2>
              <button 
                onClick={() => router.push('/music')}
                className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                Show all
              </button>
            </div>
            
            <Slider itemWidth="180px" gap="16px">
              {albums.slice(0, 8).map((album, index) => (
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
                      priority={index < 4} // Priority load first 4 albums
                    />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1 truncate group-hover:underline">{album.title}</h3>
                  <p className="text-gray-400 text-xs truncate">{album.artist?.name || 'Unknown Artist'}</p>
                </div>
              ))}
            </Slider>
          </section>
        )}

        {/* Recent Artists Section */}
        {artists.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recent artists</h2>
              <button 
                onClick={() => router.push('/music')}
                className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                Show all
              </button>
            </div>
            
            <Slider itemWidth="160px" gap="16px">
              {artists.slice(0, 8).map((artist) => (
                <div 
                  key={artist.id} 
                  onClick={() => handleArtistClick(artist.id)}
                  className="group cursor-pointer p-4 rounded-lg hover:bg-gray-800/30 transition-all duration-200"
                >
                  <div className="mb-4 group-hover:shadow-2xl transition-shadow duration-200">
                    <MusicImage
                      src={artist.imageUrl}
                      alt={artist.name}
                      fallbackText={artist.name}
                      size="large"
                      type="circle"
                      className="shadow-lg"
                      priority={artists.indexOf(artist) < 4} // Priority load first 4 artists
                    />
                  </div>
                  <h3 className="text-white font-semibold text-sm text-center truncate group-hover:underline">{artist.name}</h3>
                  <p className="text-gray-400 text-xs text-center">Artist</p>
                </div>
              ))}
            </Slider>
          </section>
        )}

        {/* Recently Played Section */}
        {songs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Recently played</h2>
              <button 
                onClick={() => router.push('/music')}
                className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                Show all
              </button>
            </div>
            
            <Slider itemWidth="320px" gap="16px">
              {songs.slice(0, 8).map((song) => (
                <div 
                  key={song.id} 
                  onClick={() => handleSongClick(song)}
                  className="flex items-center space-x-3 bg-gray-800/20 hover:bg-gray-800/40 rounded-lg p-3 cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex-shrink-0 relative">
                    <MusicImage
                      src={song.coverUrl}
                      alt={song.title}
                      fallbackText={song.title}
                      size="medium"
                      type="square"
                      className="shadow-md"
                      priority={songs.indexOf(song) < 4} // Priority load first 4 songs
                    />
                    {/* Play button overlay */}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate group-hover:underline">{song.title}</h3>
                    <p className="text-gray-400 text-sm truncate">
                      {song.artists.map(a => a.name).join(', ') || 'Unknown Artist'}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {formatDuration(song.durationSec)}
                    </p>
                  </div>
                </div>
              ))}
            </Slider>
          </section>
        )}
      </div>
    </AppLayout>
  );
} 
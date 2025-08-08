"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';

import MusicImage from '@/components/ui/MusicImage';
import SongCard from '@/components/SongCard';
import { musicApi, safeString, type Album, type Song } from '@/lib/api';

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </div>
    </AppLayout>
  );
} 
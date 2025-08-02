"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MagnifyingGlassIcon, UserIcon, MusicalNoteIcon, PlayIcon } from '@heroicons/react/24/outline';
import { musicApi, userApi, processArtists, safeString, type User, type Song, type Album, type Artist, type Playlist } from '@/lib/api';
import MusicImage from '@/components/ui/MusicImage';
import { useAudio } from '@/lib/audio';

type SearchFilter = 'all' | 'users' | 'songs' | 'albums' | 'artists' | 'playlists';

interface SearchResult {
  id: string;
  type: 'user' | 'song' | 'album' | 'artist' | 'playlist';
  title: string;
  subtitle: string;
  image?: string;
  data: any;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playSong } = useAudio();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([]);
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load query from URL params on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setSearchQuery(urlQuery);
      performSearch(urlQuery);
    }
  }, [searchParams]);

  // Filter results when filter changes
  useEffect(() => {
    if (filter === 'all') {
      setFilteredResults(results);
    } else {
      // Convert plural filter to singular result type
      const resultType = filter.slice(0, -1); // Remove 's' from end
      setFilteredResults(results.filter(result => result.type === resultType));
    }
  }, [results, filter]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setFilteredResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    const searchResults: SearchResult[] = [];

    try {
      // Always search all content types, then filter in the UI
      const searchPromises = [];

      // Search users
      searchPromises.push(
        userApi.searchUsers(query).catch(error => {
          console.warn('User search failed:', error);
          return [];
        })
      );

      // Search music content
      searchPromises.push(
        musicApi.searchContent(query).catch(error => {
          console.warn('Music search failed:', error);
          return { songs: [], albums: [], artists: [] };
        })
      );

      const [users, musicResults] = await Promise.all(searchPromises);

      // Process user results
      if (Array.isArray(users)) {
        users.forEach((user: { id: string; displayName?: string; username: string; avatarUrl?: string }) => {
          searchResults.push({
            id: user.id,
            type: 'user',
            title: user.displayName || user.username,
            subtitle: `@${user.username}`,
            image: user.avatarUrl || undefined,
            data: user
          });
        });
      }

      // Process music results
      if (musicResults && typeof musicResults === 'object' && 'songs' in musicResults) {
        musicResults.songs?.forEach((song: Song) => {
          searchResults.push({
            id: song.id,
            type: 'song',
            title: song.title,
            subtitle: processArtists(song.artists).join(', '),
            image: song.coverUrl,
            data: song
          });
        });

        musicResults.albums?.forEach((album: Album) => {
          searchResults.push({
            id: album.id,
            type: 'album',
            title: album.title,
            subtitle: `Album • ${safeString(album.artist?.name) || 'Unknown Artist'}`,
            image: album.coverUrl,
            data: album
          });
        });

        musicResults.artists?.forEach((artist: Artist) => {
          searchResults.push({
            id: artist.id,
            type: 'artist',
            title: artist.name,
            subtitle: 'Artist',
            image: artist.imageUrl,
            data: artist
          });
        });
      }

    } catch (error) {
      console.error('Search error:', error);
    }

    setResults(searchResults);
    setIsLoading(false);
  };



  const handleResultClick = (result: SearchResult) => {
    switch (result.type) {
      case 'user':
        router.push(`/user/${result.data.username || result.data.id}`);
        break;
      case 'song':
        // Play the song
        playSong(result.data);
        break;
      case 'album':
        router.push(`/album/${result.id}`);
        break;
      case 'artist':
        router.push(`/artist/${result.id}`);
        break;
      case 'playlist':
        router.push(`/playlist/${result.id}`);
        break;
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <UserIcon className="w-4 h-4" />;
      case 'song':
      case 'album':
      case 'artist':
      case 'playlist':
        return <MusicalNoteIcon className="w-4 h-4" />;
      default:
        return <MagnifyingGlassIcon className="w-4 h-4" />;
    }
  };

  const filters: { key: SearchFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: results.length },
    { key: 'songs', label: 'Songs', count: results.filter(r => r.type === 'song').length },
    { key: 'albums', label: 'Albums', count: results.filter(r => r.type === 'album').length },
    { key: 'artists', label: 'Artists', count: results.filter(r => r.type === 'artist').length },
    { key: 'users', label: 'Users', count: results.filter(r => r.type === 'user').length },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Search Header */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-white">Search SpotiBuds</h1>
            <p className="text-gray-400">Find your favorite music, artists, albums, and friends</p>
          </div>

          {/* Search Form */}
          <div className="relative max-w-2xl mx-auto">
            <MagnifyingGlassIcon className="w-6 h-6 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for songs, artists, albums, or users..."
              className="w-full bg-gray-800 text-white placeholder-gray-400 pl-12 pr-4 py-4 rounded-full text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 border border-gray-700 hover:border-gray-600 transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          {hasSearched && (
            <div className="flex flex-wrap justify-center gap-2">
              {filters.map((filterOption) => (
                <button
                  key={filterOption.key}
                  onClick={() => setFilter(filterOption.key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    filter === filterOption.key
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {filterOption.label}
                  {filterOption.count !== undefined && filterOption.count > 0 && (
                    <span className="ml-2 px-2 py-1 bg-gray-600 rounded-full text-xs">
                      {filterOption.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Searching for "{searchQuery}"...</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && hasSearched && (
          <div className="space-y-4">
            {filteredResults.length > 0 ? (
              <div className="grid gap-4">
                {filteredResults.map((result) => (
                  <Card 
                    key={`${result.type}-${result.id}`}
                    className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 hover:bg-gray-700/80 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 cursor-pointer group transform hover:scale-[1.02]"
                    onClick={() => handleResultClick(result)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          {result.type === 'user' ? (
                            // User avatar
                            result.image ? (
                              <img
                                src={result.image}
                                alt={safeString(result.title)}
                                className="w-16 h-16 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-xl">
                                  {safeString(result.title).charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )
                          ) : (
                            // Music content - use MusicImage component
                            <MusicImage
                              src={result.image}
                              alt={safeString(result.title)}
                              fallbackText={safeString(result.title).charAt(0).toUpperCase()}
                              size="large"
                              type="square"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            {getResultIcon(result.type)}
                            <span className="text-xs text-gray-400 uppercase font-medium">
                              {result.type}
                            </span>
                          </div>
                          <h3 className="text-white font-semibold truncate group-hover:text-purple-400 transition-colors">
                            {safeString(result.title)}
                          </h3>
                          {result.subtitle && (
                            <p className="text-gray-400 text-sm truncate">
                              {result.subtitle}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {result.type === 'song' && 'Click to play song'}
                            {result.type === 'album' && 'Click to view album'}
                            {result.type === 'artist' && 'Click to view artist profile'}
                            {result.type === 'user' && 'Click to view profile'}
                          </p>
                        </div>
                        <div className="flex-shrink-0 flex items-center space-x-2">
                          {result.type === 'song' && (
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700 text-white rounded-full p-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                playSong(result.data);
                              }}
                            >
                              <PlayIcon className="w-4 h-4" />
                            </Button>
                          )}
                          <div className="text-gray-400 group-hover:text-purple-400 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No results found for &quot;{searchQuery}&quot;</h3>
                <p className="text-gray-400 mb-4">
                  Try searching with different keywords or check your spelling
                </p>
                <div className="text-sm text-gray-500">
                  <p>Search tips:</p>
                  <ul className="mt-2 space-y-1">
                    <li>• Try shorter, more general terms</li>
                    <li>• Check for typos in artist or song names</li>
                    <li>• Search by genre or album name</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No search performed yet */}
        {!hasSearched && !isLoading && (
          <div className="text-center py-12">
            <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Discover Music & Friends</h3>
            <p className="text-gray-400 mb-8">
              Search for your favorite songs, artists, albums, or connect with friends
            </p>
            
            {/* Search Suggestions */}
            <div className="max-w-2xl mx-auto">
              <h4 className="text-lg font-medium text-white mb-4">Popular Searches</h4>
              <div className="flex flex-wrap justify-center gap-3">
                {['Rock', 'Pop', 'Jazz', 'Hip Hop', 'Classical', 'Electronic'].map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSearchQuery(genre)}
                    className="px-4 py-2 bg-gray-700 hover:bg-purple-600 text-gray-300 hover:text-white rounded-full text-sm font-medium transition-colors"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
} 
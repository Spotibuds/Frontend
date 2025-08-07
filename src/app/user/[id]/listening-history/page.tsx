'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import MusicImage from '@/components/ui/MusicImage';
import { userApi, identityApi } from '@/lib/api';
import { ArrowLeftIcon, PlayIcon } from '@heroicons/react/24/outline';

interface ListeningHistoryItem {
  songId: string;
  songTitle: string;
  artist: string | { name: string };
  coverUrl?: string;
  playedAt: string;
  duration?: number;
}

interface User {
  id: string;
  identityUserId: string;
  username: string;
  displayName?: string;
  isPrivate: boolean;
}

export default function ListeningHistoryPage() {
  const { id } = useParams();
  const router = useRouter();
  const [listeningHistory, setListeningHistory] = useState<ListeningHistoryItem[]>([]);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const userId = Array.isArray(id) ? id[0] : id;
  const isOwnProfile = currentUser && profileUser && currentUser.id === profileUser.identityUserId;

  const loadListeningHistory = async (skipAmount = 0, reset = false) => {
    if (!profileUser) return;

    if (!reset && skipAmount > 0) {
      setIsLoadingMore(true);
    }

    try {
      const history = await userApi.getListeningHistory(profileUser.identityUserId, limit, skipAmount);
      
      if (reset) {
        setListeningHistory(history);
      } else {
        setListeningHistory(prev => [...prev, ...history]);
      }
      
      setHasMore(history.length === limit);
    } catch (error) {
      console.error('Failed to load listening history:', error);
      if (skipAmount === 0) {
        setError('Failed to load listening history');
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      const newSkip = skip + limit;
      setSkip(newSkip);
      loadListeningHistory(newSkip);
    }
  };

  const getArtistName = (artist: string | { name: string }) => {
    return typeof artist === 'string' ? artist : (artist?.name || 'Unknown Artist');
  };

  useEffect(() => {
    const user = identityApi.getCurrentUser();
    if (!user) {
      setError('Please log in to view listening history');
      setIsLoading(false);
      return;
    }
    
    setCurrentUser(user);

    if (userId) {
      // Load profile user first
      const loadProfileUser = async () => {
        try {
          const userData = await userApi.getUserProfileByIdentityId(userId);
          setProfileUser({
            id: userData.id,
            identityUserId: userData.identityUserId,
            username: userData.username,
            displayName: userData.displayName,
            isPrivate: userData.isPrivate || false
          });
        } catch (error) {
          console.error('Failed to load user profile:', error);
          setError('Failed to load user profile');
        }
      };

      loadProfileUser();
    }
  }, [userId]);

  useEffect(() => {
    if (profileUser && currentUser) {
      // Check if user can view this listening history
      const canView = currentUser.id === profileUser.identityUserId || !profileUser.isPrivate;
      
      if (!canView) {
        setError('This user\'s listening history is private');
        setIsLoading(false);
        return;
      }

      loadListeningHistory(0, true);
      setIsLoading(false);
    }
  }, [profileUser, currentUser]);

  if (isLoading) {
  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-4 bg-gray-800 rounded-lg">
                  <div className="w-12 h-12 bg-gray-700 rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
          <div className="max-w-6xl mx-auto">
            <button
              onClick={() => router.back()}
              className="flex items-center text-gray-400 hover:text-white transition-colors mb-6"
            >
              <ArrowLeftIcon className="w-5 h-5 mr-2" />
              Back
            </button>
            <div className="text-center py-16">
              <div className="w-24 h-24 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                <svg className="w-12 h-12 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Error</h1>
              <p className="text-gray-400">{error}</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="flex items-center text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5 mr-2" />
                Back
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {isOwnProfile ? 'My Listening History' : `${profileUser?.displayName || profileUser?.username}'s Listening History`}
                </h1>
                <p className="text-gray-400">
                  {listeningHistory.length} song{listeningHistory.length !== 1 ? 's' : ''} played
                </p>
              </div>
            </div>
          </div>

          {/* Listening History List */}
          {listeningHistory.length > 0 ? (
            <div className="space-y-2">
              {listeningHistory.map((item, index) => (
                <div
                  key={`${item.songId}-${item.playedAt}-${index}`}
                  className="flex items-center space-x-4 p-4 hover:bg-gray-800/50 rounded-lg transition-colors group"
                >
                  {/* Play Button */}
                  <div className="w-10 h-10 flex items-center justify-center">
                    <span className="text-gray-400 text-sm group-hover:hidden">
                      {index + 1}
                    </span>
                    <button className="hidden group-hover:flex w-8 h-8 bg-green-500 hover:bg-green-600 rounded-full items-center justify-center transition-colors">
                      <PlayIcon className="w-4 h-4 text-white ml-0.5" />
                    </button>
                  </div>

                  {/* Song Cover */}
                  <div className="flex-shrink-0">
                    {item.coverUrl ? (
                      <MusicImage
                        src={item.coverUrl}
                        alt={item.songTitle}
                        fallbackText={item.songTitle}
                        size="medium"
                        type="square"
                        className="w-12 h-12"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Song Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{item.songTitle}</h3>
                    <p className="text-gray-400 text-sm truncate">{getArtistName(item.artist)}</p>
                  </div>

                  {/* Duration and Time */}
                  <div className="flex items-center space-x-4 text-gray-400 text-sm">
                    <span className="text-xs">
                      {new Date(item.playedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="text-center pt-6">
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full transition-colors"
                  >
                    {isLoadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 bg-gray-800/40 backdrop-blur-sm border border-gray-700 rounded-2xl">
              <div className="w-24 h-24 mx-auto bg-gray-700/50 rounded-full flex items-center justify-center mb-6">
                <svg className="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">No Listening History</h2>
              <p className="text-gray-400">
                {isOwnProfile ? 'Start listening to music to see your history here' : 'No listening history available'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

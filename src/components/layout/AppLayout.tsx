"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import MusicImage from "@/components/ui/MusicImage";
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  MusicalNoteIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  BriefcaseIcon,

  ChatBubbleLeftRightIcon,
  NewspaperIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  HeartIcon,
  ArrowLeftOnRectangleIcon,
  BellIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowPathIcon,
  Squares2X2Icon as ShuffleIcon,
  ListBulletIcon,
  QueueListIcon,
} from "@heroicons/react/24/outline";
import { useAudio } from "@/lib/audio";
import { identityApi, getProxiedImageUrl, processArtists, safeString, userApi } from "@/lib/api";
import { ToastContainer } from "@/components/ui/Toast";
import { notificationService } from "@/lib/notificationService";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true); // Default open on desktop
  const [queueOpen, setQueueOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; username: string; displayName?: string; avatarUrl?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSidebarState = localStorage.getItem('sidebarOpen');
      if (savedSidebarState !== null) {
        setSidebarOpen(JSON.parse(savedSidebarState));
      }
    }
  }, []);

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen));
    }
  }, [sidebarOpen]);
  const [friendRequests, setFriendRequests] = useState<{ requestId: string; requesterId: string; requesterUsername: string; requesterAvatar?: string; requestedAt: string }[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likedSongsPlaylistId, setLikedSongsPlaylistId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const loadedFriendRequestsRef = useRef(false);
  const { state, togglePlayPause, nextSong, previousSong, skipForward, skipBackward, seekTo, setVolume, toggleMute, setShuffle, setRepeat, shuffleMode, repeatMode, removeFromQueue, clearQueue } = useAudio();
  

  
  // Toast state
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    action?: {
      label: string;
      onClick: () => void;
    };
  }>>([]);



  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((
    message: string, 
    type: 'success' | 'error' | 'info' = 'info',
    action?: { label: string; onClick: () => void }
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => removeToast(id), action ? 8000 : 5000); // Longer duration for actionable toasts
  }, [removeToast]);

  
  useEffect(() => {
    const initializeUser = async () => {
      const currentUser = identityApi.getCurrentUser();
      if (currentUser) {
        setIsLoggedIn(true);
        setIsAdmin(currentUser.roles?.includes("Admin") || false);
        
        // Load full user profile to get avatar and other details
        try {
          const fullProfile = await userApi.getCurrentUserProfile();
          if (fullProfile) {
            setUser(fullProfile);
          } else {
            // Fallback to basic user data
            setUser(currentUser);
          }
        } catch (error) {
          console.error('Failed to load user profile, using basic data:', error);
          setUser(currentUser);
        }
        
        // Only load friend requests once on mount
        if (!loadedFriendRequestsRef.current) {
          loadFriendRequests(currentUser.id);
        }
      }
      setIsLoading(false);
    };

    initializeUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount, loadFriendRequests is stable

  useEffect(() => {
    // Set up chat notification handler
    const removeNotificationHandler = notificationService.addNotificationHandler(async (message) => {
      // Get sender information for better notification
      let senderName = message.senderName || 'Unknown';
      try {
        if (message.senderId) {
          const senderProfile = await userApi.getUserProfile(message.senderId);
          senderName = senderProfile.displayName || senderProfile.username || 'Unknown';
        }
      } catch (error) {
        console.warn('Could not fetch sender profile:', error);
      }

      // Show enhanced toast notification with click action
      const notificationMessage = `💬 ${senderName}: ${message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content}`;
      
      addToast(notificationMessage, 'info', {
        label: 'Open Chat',
        onClick: () => {
          router.push(`/chat/${message.chatId}`);
        }
      });
      
      // Also show browser notification if permission granted
      notificationService.showBrowserNotification(message, senderName);
    });

    // Request notification permission on first load
    notificationService.requestPermission().then(granted => {
      if (granted) {
        console.log('✅ Browser notifications enabled for chat messages');
      } else {
        console.log('💡 Tip: Enable browser notifications to get alerts for new messages when the app is not active');
      }
    }).catch(console.warn);

    return () => {
      removeNotificationHandler();
    };
  }, [addToast, router]);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.notifications-dropdown')) {
        setNotificationsOpen(false);
      }
    };

    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationsOpen]);

  const loadFriendRequests = useCallback(async (userId: string) => {
    // Prevent multiple simultaneous requests
    if (isLoadingNotifications || loadedFriendRequestsRef.current) {
      console.log('Friend requests already loading/loaded, skipping...');
      return;
    }

    loadedFriendRequestsRef.current = true;

    try {
      setIsLoadingNotifications(true);
      const requests = await userApi.getPendingFriendRequests(userId);
      setFriendRequests(requests);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
      // On service unavailable, set empty array to prevent retries
      if (error instanceof Error && error.message.includes('service unavailable')) {
        console.warn('🚫 User service unavailable - setting empty friend requests');
        setFriendRequests([]);
      }
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [isLoadingNotifications]);

  const handleAcceptRequest = async (requestId: string) => {
    if (!user || !requestId) {
      console.error('Invalid request: missing user or requestId');
      return;
    }

    try {
      await userApi.acceptFriendRequest(requestId, user.id);
      // Remove from local state immediately
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      // No need to refresh - state is already updated
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!user || !requestId) {
      console.error('Invalid request: missing user or requestId');
      return;
    }

    try {
      await userApi.declineFriendRequest(requestId, user.id);
      // Remove from local state immediately
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      // No need to refresh - state is already updated
    } catch (error) {
      console.error('Failed to decline friend request:', error);
    }
  };

  // Real-time friend request updates - handled by useFriendHub hook in individual pages
  // Removed duplicate event handler setup to prevent infinite loop

  const handleLikeSong = async () => {
    if (!state.currentSong || !user || isLiking) return;

    try {
      setIsLiking(true);
      
      // Import playlist service
      const { PlaylistService } = await import('@/lib/playlist');
      
      let playlistId = likedSongsPlaylistId;
      
      // Create "Liked Songs" playlist if it doesn't exist
      if (!playlistId) {
        try {
          // First, check if a "Liked Songs" playlist already exists
          const userPlaylists = await PlaylistService.getUserPlaylists(user.id);
          const existingLikedSongs = userPlaylists.find(p => p.name === 'Liked Songs');
          
          if (existingLikedSongs) {
            playlistId = existingLikedSongs.id;
          } else {
            // Create new "Liked Songs" playlist
            const newPlaylist = await PlaylistService.createPlaylist(user.id, {
              name: 'Liked Songs',
              description: 'Your favorite songs'
            });
            playlistId = newPlaylist.id;
          }
          
          setLikedSongsPlaylistId(playlistId);
        } catch (error) {
          console.error('Failed to create/find Liked Songs playlist:', error);
          return;
        }
      }
      
      // Add song to "Liked Songs" playlist
      if (playlistId) {
        await PlaylistService.addSongToPlaylist(playlistId, state.currentSong.id);
        setIsLiked(true);
        
        // Show success feedback
        setTimeout(() => setIsLiked(false), 2000);
      }
    } catch (error) {
      console.error('Failed to like song:', error);
    } finally {
      setIsLiking(false);
    }
  };

  const handleLogout = () => {
    identityApi.logout();
    setIsLoggedIn(false);
    router.push("/");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!state.duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * state.duration;
    seekTo(newTime);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    setVolume(Math.max(0, Math.min(1, percent)));
  };

  // Close sidebar on mobile when navigating
  const handleNavClick = () => {
    // Only close sidebar on mobile (screen width < 1024px)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const navigation = [
    { name: "Home", href: "/dashboard", icon: HomeIcon, current: pathname === "/dashboard" },
    { name: "Feed", href: "/feed", icon: NewspaperIcon, current: pathname === "/feed" },
    { name: "Browse", href: "/music", icon: MusicalNoteIcon, current: pathname === "/music" },
    { name: "Search", href: "/search", icon: MagnifyingGlassIcon, current: pathname === "/search" },
    { name: "Playlists", href: "/playlists", icon: ListBulletIcon, current: pathname === "/playlists" },
    { name: "Friends", href: "/friends", icon: UserGroupIcon, current: pathname === "/friends" },
    { name: "Chat", href: "/chat", icon: ChatBubbleLeftRightIcon, current: pathname === "/chat" },
   ...(isAdmin
    ? [{
        name: "Admin",
        href: "/admin",
        icon: BriefcaseIcon,
        current: pathname.startsWith("/admin") 
      }]
    : []),
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="flex items-center justify-center space-x-3 mb-8">
            <MusicalNoteIcon className="h-12 w-12 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">SpotiBuds</h1>
          </div>
          <p className="text-xl text-gray-300 mb-8">Please log in to continue</p>
          <div className="space-x-4">
            <button
              onClick={() => router.push("/")}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-black transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out flex flex-col`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-center h-16 px-6 border-b border-gray-800">
          <Link href="/dashboard" className="flex items-center space-x-3">
            <Image src="/logo.svg" alt="Spotibuds Logo" width={200} height={60} className="h-12 w-auto" priority />
            <span className="text-2xl font-bold text-white">Spotibuds</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
                item.current
                  ? "bg-purple-900 text-purple-100"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
              onClick={handleNavClick}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* User menu */}
        <div className="border-t border-gray-800 p-4">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-300 rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
          >
            <ArrowLeftOnRectangleIcon className="mr-3 h-5 w-5" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'pl-64' : 'pl-0'}`}>
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 bg-gray-800/95 backdrop-blur-sm border-b border-gray-700">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              
              {/* Sidebar toggle button (all screen sizes) */}
              <button
                className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {sidebarOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>

              {/* Search Bar */}
              <div className="flex-1 max-w-lg mx-4">
                <form onSubmit={handleSearch} className="relative">
                  <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for songs, artists, albums..."
                    className="w-full bg-gray-700 text-white placeholder-gray-400 pl-10 pr-4 py-2 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 border border-gray-600 hover:border-gray-500 transition-colors"
                  />
                </form>
              </div>

              {/* Right side items */}
              <div className="flex items-center space-x-4">
                {/* Notifications */}
                <div className="relative notifications-dropdown">
                  <button 
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors relative"
                  >
                    <BellIcon className="h-6 w-6" />
                    {friendRequests.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {friendRequests.length}
                      </span>
                    )}
                  </button>

                  {/* Notifications Dropdown */}
                  {notificationsOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                      <div className="p-4 border-b border-gray-700">
                        <h3 className="text-white font-semibold">Notifications</h3>
                      </div>
                      
                      <div className="max-h-96 overflow-y-auto">
                        {isLoadingNotifications ? (
                          <div className="p-4 text-center">
                            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-gray-400 text-sm mt-2">Loading...</p>
                          </div>
                        ) : friendRequests.length > 0 ? (
                          <div className="p-4 space-y-3">
                            <h4 className="text-gray-300 font-medium text-sm">Friend Requests</h4>
                            {friendRequests.map((request) => (
                              <div key={request.requestId} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                                                     <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                     <span className="text-white font-bold text-sm">
                                       {(request.requesterUsername || 'U').charAt(0).toUpperCase()}
                                     </span>
                                   </div>
                                                                     <div>
                                     <p className="text-white text-sm font-medium">{request.requesterUsername || 'Unknown User'}</p>
                                     <p className="text-gray-400 text-xs">
                                       {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString('en-US', {
                                         year: 'numeric',
                                         month: 'short',
                                         day: 'numeric'
                                       }) : 'Unknown date'}
                                     </p>
                                   </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleAcceptRequest(request.requestId)}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={() => handleDeclineRequest(request.requestId)}
                                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded transition-colors"
                                  >
                                    Decline
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center">
                            <div className="w-12 h-12 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <BellIcon className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-gray-400 text-sm">No new notifications</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Profile Menu */}
                <div className="relative">
                  <button 
                    onClick={() => router.push(`/user`)}
                    className="flex items-center space-x-3 text-gray-300 hover:text-white transition-colors"
                  >
                    {user?.avatarUrl ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                        <MusicImage
                          src={user.avatarUrl}
                          alt={user.username || 'User'}
                          className="w-full h-full object-cover"
                          size="small"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">
                          {safeString(user?.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="hidden sm:block font-medium">{safeString(user?.username)}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="pb-24">
          {children}
        </main>

        {/* Toast notifications */}
        <ToastContainer toasts={toasts} onRemoveToast={removeToast} />

        {/* Queue Panel */}
        {queueOpen && (
          <div className="fixed right-4 bottom-24 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">Queue ({state.queue.length})</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={clearQueue}
                  className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 hover:bg-gray-700 rounded"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setQueueOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto max-h-64">
              {state.queue.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  <QueueListIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No songs in queue</p>
                  <p className="text-xs mt-1">Add songs to see them here</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {state.queue.map((song, index) => (
                    <div key={`${song.id}-${index}`} className="p-3 hover:bg-gray-700/50 transition-colors group">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                          {song.coverUrl ? (
                            <MusicImage 
                              src={getProxiedImageUrl(song.coverUrl) || song.coverUrl} 
                              alt={safeString(song.title)}
                              className="w-full h-full object-cover"
                              size="small"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">
                              {safeString(song.title).charAt(0) || 'S'}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">
                            {safeString(song.title)}
                          </p>
                          <p className="text-gray-400 text-xs truncate">
                            {song.artists ? 
                              processArtists(song.artists).join(', ') : 
                              'Unknown Artist'}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromQueue(index)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-white transition-all"
                          title="Remove from queue"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Audio Player */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-3 lg:pl-64">
          <div className="max-w-screen-xl mx-auto">
            <div className="flex items-center justify-between">
              {/* Current Song Info */}
              <div className="flex items-center space-x-3 flex-1 min-w-0 max-w-sm">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                  {state.currentSong?.coverUrl ? (
                    <MusicImage 
                      src={getProxiedImageUrl(state.currentSong.coverUrl) || state.currentSong.coverUrl} 
                      alt={safeString(state.currentSong.title)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-bold">
                      {safeString(state.currentSong?.title).charAt(0) || 'S'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {safeString(state.currentSong?.title) || 'No song playing'}
                  </p>
                  <p className="text-gray-400 text-xs truncate">
                    {state.currentSong?.artists ? 
                      processArtists(state.currentSong.artists).join(', ') : 
                      'Select a song'}
                  </p>
                </div>
                <button 
                  onClick={handleLikeSong}
                  className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                  title="Add to Liked Songs"
                  disabled={!state.currentSong || isLiking}
                >
                  {isLiking ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
                  ) : (
                    <HeartIcon className={`w-5 h-5 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-white'}`} />
                  )}
                </button>
              </div>

              {/* Playback Controls */}
              <div className="flex flex-col items-center space-y-2 flex-1 max-w-2xl">
                {/* Control buttons row 1 */}
                <div className="flex items-center space-x-1 text-xs">
                  <button 
                    onClick={() => setShuffle(!shuffleMode)}
                    className={`p-1 rounded transition-colors ${shuffleMode ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}
                    title="Shuffle"
                  >
                    <ShuffleIcon className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => setRepeat(
                      repeatMode === 'off' ? 'all' : 
                      repeatMode === 'all' ? 'one' : 'off'
                    )}
                    className={`p-1 rounded transition-colors ${
                      repeatMode !== 'off' ? 'text-purple-400' : 'text-gray-400 hover:text-white'
                    }`}
                    title={`Repeat ${repeatMode}`}
                  >
                    {repeatMode === 'one' ? (
                      <span className="text-xs">1</span>
                    ) : (
                      <ArrowPathIcon className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {/* Main control buttons row */}
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => skipBackward(10)}
                    className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                    disabled={!state.currentSong}
                    title="Skip backward 10s"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4 text-gray-400 hover:text-white" />
                  </button>
                  
                  <button 
                    onClick={previousSong}
                    className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                    disabled={!state.currentSong}
                    title="Previous song (or restart if >3s)"
                  >
                    <BackwardIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                  </button>
                  
                  <button
                    onClick={togglePlayPause}
                    className="p-3 bg-white rounded-full hover:scale-105 transition-transform"
                    disabled={!state.currentSong}
                  >
                    {state.isPlaying ? (
                      <PauseIcon className="w-6 h-6 text-black" />
                    ) : (
                      <PlayIcon className="w-6 h-6 text-black" />
                    )}
                  </button>
                  
                  <button 
                    onClick={nextSong}
                    className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                    disabled={!state.currentSong}
                  >
                    <ForwardIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                  </button>

                  <button 
                    onClick={() => skipForward(10)}
                    className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                    disabled={!state.currentSong}
                    title="Skip forward 10s"
                  >
                    <ArrowUturnRightIcon className="w-4 h-4 text-gray-400 hover:text-white" />
                  </button>
                </div>
                
                {/* Progress bar */}
                <div className="flex items-center space-x-2 w-full max-w-lg">
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {Math.floor(state.currentTime / 60)}:{(Math.floor(state.currentTime) % 60).toString().padStart(2, '0')}
                  </span>
                  <div 
                    className="flex-1 bg-gray-600 rounded-full h-1 cursor-pointer"
                    onClick={handleSeekClick}
                  >
                    <div 
                      className="bg-white rounded-full h-1 transition-all duration-100"
                      style={{ width: `${state.duration ? (state.currentTime / state.duration) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10">
                    {state.duration ? `${Math.floor(state.duration / 60)}:${(Math.floor(state.duration) % 60).toString().padStart(2, '0')}` : '0:00'}
                  </span>
                </div>
              </div>

              {/* Volume Controls */}
              <div className="flex items-center space-x-2 flex-1 justify-end max-w-sm">
                <button 
                  onClick={() => setQueueOpen(!queueOpen)}
                  className={`relative p-2 rounded-full transition-colors ${queueOpen ? 'bg-gray-700 text-purple-400' : 'hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                  title={`${queueOpen ? 'Hide' : 'Show'} queue (${state.queue.length})`}
                >
                  <QueueListIcon className="w-5 h-5" />
                  {state.queue.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {state.queue.length}
                    </span>
                  )}
                </button>
                <button 
                  onClick={toggleMute}
                  className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                  title={state.isMuted ? 'Unmute' : 'Mute'}
                >
                  {state.isMuted || state.volume === 0 ? (
                    <SpeakerXMarkIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                  ) : (
                    <SpeakerWaveIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                  )}
                </button>
                <div 
                  className="w-24 bg-gray-600 rounded-full h-1 cursor-pointer"
                  onClick={handleVolumeClick}
                >
                  <div 
                    className="bg-white rounded-full h-1"
                    style={{ width: `${state.volume * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
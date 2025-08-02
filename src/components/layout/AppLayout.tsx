"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  MusicalNoteIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,

  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  HeartIcon,
  ArrowLeftOnRectangleIcon,
  BellIcon,
} from "@heroicons/react/24/outline";
import { useAudio } from "@/lib/audio";
import { identityApi, getProxiedImageUrl, processArtists, safeString, userApi } from "@/lib/api";
import { useFriendHub } from "@/hooks/useFriendHub";
import { friendHubManager } from "@/lib/friendHub";
import { ToastContainer } from "@/components/ui/Toast";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; username: string; displayName?: string; avatarUrl?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [friendRequests, setFriendRequests] = useState<{ requestId: string; requesterId: string; requesterUsername: string; requesterAvatar?: string; requestedAt: string }[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { state, togglePlayPause, seekTo, setVolume } = useAudio();
  

  
  // Toast state
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>>([]);



  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };



  useEffect(() => {
    const currentUser = identityApi.getCurrentUser();
    if (currentUser) {
      setIsLoggedIn(true);
      setUser(currentUser);
      loadFriendRequests(currentUser.id);
    }
    setIsLoading(false);
  }, []);

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

  const loadFriendRequests = async (userId: string) => {
    try {
      setIsLoadingNotifications(true);
      const requests = await userApi.getPendingFriendRequests(userId);
      setFriendRequests(requests);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!user || !requestId) {
      console.error('Invalid request: missing user or requestId');
      return;
    }

    try {
      await userApi.acceptFriendRequest(requestId, user.id);
      // Remove from local state immediately
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      // Refresh the page to ensure all data is up to date
      window.location.reload();
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
      // Refresh the page to ensure all data is up to date
      window.location.reload();
    } catch (error) {
      console.error('Failed to decline friend request:', error);
    }
  };

  // Real-time friend request updates
  useEffect(() => {
    const handleFriendRequestReceived = (data: { requestId?: string; requesterId?: string; requesterUsername?: string; requesterAvatar?: string; requestedAt?: string }) => {
      // Add new friend request to the list
      setFriendRequests(prev => [...prev, {
        requestId: data.requestId || Math.random().toString(36).substr(2, 9), // Use actual requestId if available
        requesterId: data.requesterId || '',
        requesterUsername: data.requesterUsername || 'Unknown User',
        requesterAvatar: data.requesterAvatar,
        requestedAt: data.requestedAt || new Date().toISOString()
      }]);
    };

    const handleFriendRequestAccepted = (data: { requestId?: string }) => {
      // Remove the accepted request from the list
      if (data.requestId) {
        setFriendRequests(prev => prev.filter(req => req.requestId !== data.requestId));
      }
    };

    const handleFriendRequestDeclined = (data: { requestId?: string }) => {
      // Remove the declined request from the list
      if (data.requestId) {
        setFriendRequests(prev => prev.filter(req => req.requestId !== data.requestId));
      }
    };

    // Set up event handlers for real-time updates
    friendHubManager.setOnFriendRequestReceived(handleFriendRequestReceived);
    friendHubManager.setOnFriendRequestAccepted(handleFriendRequestAccepted);
    friendHubManager.setOnFriendRequestDeclined(handleFriendRequestDeclined);

    return () => {
      friendHubManager.setOnFriendRequestReceived(() => {});
      friendHubManager.setOnFriendRequestAccepted(() => {});
      friendHubManager.setOnFriendRequestDeclined(() => {});
    };
  }, [user?.id]);

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

  const navigation = [
    { name: "Home", href: "/dashboard", icon: HomeIcon, current: pathname === "/dashboard" },
    { name: "Browse", href: "/music", icon: MusicalNoteIcon, current: pathname === "/music" },
    { name: "Search", href: "/search", icon: MagnifyingGlassIcon, current: pathname === "/search" },
    { name: "Friends", href: "/friends", icon: UserGroupIcon, current: pathname === "/friends" },
    { name: "Chat", href: "/chat", icon: ChatBubbleLeftRightIcon, current: pathname === "/chat" },
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
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-black transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <MusicalNoteIcon className="h-8 w-8 text-purple-400" />
            <span className="text-xl font-bold text-white">SpotiBuds</span>
          </div>
          <button
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
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
              onClick={() => setSidebarOpen(false)}
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
      <div className="lg:pl-64">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 bg-gray-800/95 backdrop-blur-sm border-b border-gray-700">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              
              {/* Mobile menu button */}
              <button
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700"
                onClick={() => setSidebarOpen(true)}
              >
                <Bars3Icon className="h-6 w-6" />
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
                      <img
                        src={user.avatarUrl}
                        alt={user.username}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
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

        {/* Bottom Audio Player */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-3 lg:pl-64">
          <div className="max-w-screen-xl mx-auto">
            <div className="flex items-center justify-between">
              {/* Current Song Info */}
              <div className="flex items-center space-x-3 flex-1 min-w-0 max-w-sm">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                  {state.currentSong?.coverUrl ? (
                    <img 
                      src={getProxiedImageUrl(state.currentSong.coverUrl) || state.currentSong.coverUrl} 
                      alt={safeString(state.currentSong.title)}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
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
                <button className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0">
                  <HeartIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Playback Controls */}
              <div className="flex flex-col items-center space-y-2 flex-1 max-w-2xl">
                <div className="flex items-center space-x-4">
                  <button className="p-2 rounded-full hover:bg-gray-700 transition-colors">
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
                  
                  <button className="p-2 rounded-full hover:bg-gray-700 transition-colors">
                    <ForwardIcon className="w-5 h-5 text-gray-400 hover:text-white" />
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
                <button className="p-2 rounded-full hover:bg-gray-700 transition-colors">
                  {state.volume > 0 ? (
                    <SpeakerWaveIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                  ) : (
                    <SpeakerXMarkIcon className="w-5 h-5 text-gray-400 hover:text-white" />
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
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import MusicImage from "@/components/ui/MusicImage";
import { Toast } from "@/components/ui/Toast";
import { identityApi, userApi, FriendRequest } from "@/lib/api";
import { useFriendHub } from "@/hooks/useFriendHub";
import { notificationHub } from "@/lib/notificationHub";

interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  displayName?: string;
  bio?: string;
  isPrivate?: boolean;
}



export default function FriendsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());
  const [processingFriends, setProcessingFriends] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    // Longer timeout for better user feedback
    const timeout = type === 'success' ? 4000 : type === 'error' ? 6000 : 5000;
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, timeout);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const handleError = useCallback((error: string) => {
    console.error('FriendHub Error:', error);
    addToast(`Connection error: ${error}`, 'error');
  }, [addToast]);

  // Initialize friend hub for real-time updates
  const { 
    isConnected, 
    connectionState, 
    error: hubError,
    lastFriendRequestReceived,
    lastFriendRequestAccepted,
    lastFriendRequestDeclined,
    lastFriendRequestSent,
    lastFriendRemoved,
    clearLastEvents
  } = useFriendHub({
    userId: currentUser?.id,
    autoConnect: true,
    onError: handleError
  });

  // Get current user from auth context
  useEffect(() => {
    const user = identityApi.getCurrentUser();
    if (user) {
      setCurrentUser({
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
        bio: user.bio,
        isPrivate: user.isPrivate
      });
    }
  }, []);

  // Define load functions with useCallback
  const loadFriendRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    
    try {
      const requests = await userApi.getPendingFriendRequests(currentUser.id);
      setFriendRequests(requests);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
    }
  }, [currentUser?.id]);

  const loadFriends = useCallback(async () => {
    if (!currentUser?.id) return;
    
    try {
      const friendIds = await userApi.getFriends(currentUser.id);
      
      // Get actual user data for each friend
      const friendUsers: User[] = [];
      for (const friendId of friendIds) {
        try {
          const friendUser = await userApi.getUserProfile(friendId);
          friendUsers.push({
            id: friendUser.id,
            username: friendUser.username,
            avatarUrl: friendUser.avatarUrl,
            displayName: friendUser.displayName,
            bio: friendUser.bio,
            isPrivate: friendUser.isPrivate
          });
        } catch (error) {
          console.error(`Failed to load friend data for ${friendId}:`, error);
        }
      }
      
      setFriends(friendUsers);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  }, [currentUser?.id]);

  // Load friend requests and friends when user is set
  useEffect(() => {
    if (currentUser?.id) {
      loadFriendRequests();
      loadFriends();
      setLoading(false);
    }
  }, [currentUser?.id, loadFriendRequests, loadFriends]);

  // Real-time friend request updates - handled by useFriendHub hook
  // Removed duplicate event handler setup to prevent infinite loop

  // Setup notification hub for friend request notifications
  useEffect(() => {
    if (!currentUser?.id) return;

    // Set up friend-specific notification handlers
    notificationHub.setHandlers({
      onNewNotification: (notification: any) => {
        // Handle friend-specific UI updates
        console.log('🔔 Friend notification received:', notification);
        
        if (notification.type === 'FriendRequest' && notification.data) {
          // Extract friend request data
          const { fromUsername } = notification.data;
          
          // Instead of adding a temporary friend request, reload the actual friend requests
          // This ensures we get the real request ID from the database
          loadFriendRequests();
          addToast(`New friend request from ${fromUsername}!`, 'info');
        } else if (notification.type === 'FriendAdded' && notification.data) {
          // Friend was added - reload friends list to show the new friend
          // Also reload friend requests to remove the accepted request
          const { friendUsername } = notification.data;
          loadFriends();
          loadFriendRequests(); // Add this to remove the accepted request
          addToast(`You are now friends with ${friendUsername}!`, 'success');
        } else if (notification.type === 'FriendRequestAccepted' && notification.data) {
          // Friend request was accepted - reload friends list to show the new friend
          const { accepterUsername } = notification.data;
          loadFriends();
          addToast(`${accepterUsername} accepted your friend request!`, 'success');
        } else if (notification.type === 'FriendRemoved' && notification.data) {
          // Friend was removed by someone else - reload friends list
          const { removerUsername } = notification.data;
          loadFriends();
          addToast(`${removerUsername} removed you as a friend`, 'info');
        } else if (notification.type === 'FriendRemovedByYou' && notification.data) {
          // You removed a friend - reload friends list
          loadFriends();
          addToast(`Friend removed successfully`, 'success');
        }
      },
      onError: (error: string) => console.error('NotificationHub error:', error)
    }, 'FriendsPage');

    // Cleanup function
    return () => {
      notificationHub.removeHandlers('FriendsPage');
    };
  }, [currentUser?.id, addToast, loadFriendRequests, loadFriends]);

  // Handle real-time friend request received
  useEffect(() => {
    if (lastFriendRequestReceived) {
      addToast(`New friend request from ${lastFriendRequestReceived.senderName}!`, 'info');
      // Convert friendHub FriendRequest to API FriendRequest format
      const apiFormatRequest: FriendRequest = {
        requestId: lastFriendRequestReceived.requestId,
        requesterId: lastFriendRequestReceived.senderId,
        requesterUsername: lastFriendRequestReceived.senderName,
        requesterAvatar: lastFriendRequestReceived.senderAvatar,
        requestedAt: lastFriendRequestReceived.timestamp
      };
      setFriendRequests(prev => [...prev, apiFormatRequest]);
      clearLastEvents();
    }
  }, [lastFriendRequestReceived, clearLastEvents, addToast]);

  // Handle real-time friend request accepted
  useEffect(() => {
    if (lastFriendRequestAccepted) {
      addToast(`Friend request accepted!`, 'success');
      setFriendRequests(prev => prev.filter(req => req.requestId !== lastFriendRequestAccepted.requestId));
      
      // Add the new friend to the local friends state
      const newFriend: User = {
        id: lastFriendRequestAccepted.friendId,
        username: lastFriendRequestAccepted.friendName,
        avatarUrl: lastFriendRequestAccepted.friendAvatar,
        displayName: lastFriendRequestAccepted.friendName,
        bio: '',
        isPrivate: false
      };
      setFriends(prev => [...prev, newFriend]);
      
      clearLastEvents();
    }
  }, [lastFriendRequestAccepted, clearLastEvents, addToast]);

  // Handle real-time friend request declined
  useEffect(() => {
    if (lastFriendRequestDeclined) {
      addToast(`Friend request declined`, 'info');
      setFriendRequests(prev => prev.filter(req => req.requestId !== lastFriendRequestDeclined.requestId));
      clearLastEvents();
    }
  }, [lastFriendRequestDeclined, clearLastEvents, addToast]);

  // Handle real-time friend request sent
  useEffect(() => {
    if (lastFriendRequestSent) {
      addToast(`Friend request sent successfully!`, 'success');
      clearLastEvents();
    }
  }, [lastFriendRequestSent, clearLastEvents, addToast]);

  // Handle real-time friend removed
  useEffect(() => {
    if (lastFriendRemoved) {
      addToast(`Friend removed`, 'info');
      setFriends(prev => prev.filter(friend => friend.id !== lastFriendRemoved.friendId));
      clearLastEvents();
    }
  }, [lastFriendRemoved, clearLastEvents, addToast]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const searchResults = await userApi.searchUsers(searchQuery);
      
      // Filter out current user and existing friends
      const filteredResults = searchResults.filter(user => 
        user.id !== currentUser?.id &&
        !friends.some(friend => friend.id === user.id)
      );
      
      setSearchResults(filteredResults);
      
      // Check which users you've already sent requests to
      await checkSentRequests(filteredResults);
    } catch {
      addToast('Failed to search users', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const checkSentRequests = async (users: User[]) => {
    if (!currentUser?.id) return;
    
    const newSentRequests = new Set<string>();
    
    for (const user of users) {
      try {
        const status = await userApi.getFriendshipStatus(currentUser.id, user.id);
        if (status.status === 'pending') {
          newSentRequests.add(user.id);
        }
      } catch (error) {
        console.error('Failed to check friendship status:', error);
      }
    }
    
    setSentRequests(newSentRequests);
  };

  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!currentUser?.id) return;
    
    // Check if already sent
    if (sentRequests.has(targetUserId)) {
      addToast('Friend request already sent!', 'info');
      return;
    }
    
    console.log('Setting processing state for:', targetUserId);
    setProcessingRequests(prev => new Set([...prev, targetUserId]));
    try {
      await userApi.sendFriendRequest(currentUser.id, targetUserId);
      // Don't show manual toast - let SignalR handle the success notification
      console.log('Adding to sentRequests:', targetUserId);
      setSentRequests(prev => new Set([...prev, targetUserId]));
      
      // Remove the user from search results since we've sent them a friend request
      setSearchResults(prev => prev.filter(user => user.id !== targetUserId));
      
      // Don't reload friend requests - this was causing sent requests to appear in your own box
    } catch (error: unknown) {
      console.error('Send friend request error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('already pending')) {
        addToast('Friend request already pending', 'info');
        setSentRequests(prev => new Set([...prev, targetUserId]));
        // Remove from search results since request is already pending
        setSearchResults(prev => prev.filter(user => user.id !== targetUserId));
      } else if (errorMessage.includes('already friends')) {
        addToast('You are already friends with this user', 'info');
        setSentRequests(prev => new Set([...prev, targetUserId]));
        // Remove from search results since already friends
        setSearchResults(prev => prev.filter(user => user.id !== targetUserId));
      } else {
        addToast(`Failed to send friend request: ${errorMessage}`, 'error');
      }
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetUserId);
        return newSet;
      });
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!currentUser?.id || !requestId) {
      addToast('Invalid request', 'error');
      return;
    }
    
    setProcessingRequests(prev => new Set([...prev, requestId]));
    try {
      await userApi.acceptFriendRequest(requestId, currentUser.id);
      addToast('Friend request accepted!', 'success');
      // Remove from local state immediately
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      // Reload friends list to show the new friend
      await loadFriends();
      // No need to reload page - state updates will handle UI changes
    } catch (error: unknown) {
      console.error('Accept friend request error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addToast(`Failed to accept friend request: ${errorMessage}`, 'error');
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!currentUser?.id || !requestId) {
      addToast('Invalid request', 'error');
      return;
    }
    
    setProcessingRequests(prev => new Set([...prev, requestId]));
    try {
      await userApi.declineFriendRequest(requestId, currentUser.id);
      addToast('Friend request declined', 'info');
      // Remove from local state immediately
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      // No need to reload page - state updates will handle UI changes
    } catch (error: unknown) {
      console.error('Decline friend request error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addToast(`Failed to decline friend request: ${errorMessage}`, 'error');
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!currentUser?.id) return;
    
    setProcessingFriends(prev => new Set([...prev, friendId]));
    try {
      // Get the friendship ID first
      const friendship = await userApi.getFriendshipStatus(currentUser.id, friendId);
      if (!friendship.friendshipId) {
        addToast('Could not find friendship to remove', 'error');
        return;
      }

      // Remove the friend via API
      await userApi.removeFriend(friendship.friendshipId, currentUser.id);
      
      // The real-time SignalR event will handle UI updates
      addToast('Friend removed successfully', 'success');
    } catch (error) {
      console.error('Failed to remove friend:', error);
      addToast('Failed to remove friend', 'error');
    } finally {
      setProcessingFriends(prev => {
        const newSet = new Set(prev);
        newSet.delete(friendId);
        return newSet;
      });
    }
  };


  if (loading) {
    return (
      <>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Friends</h1>
                <p className="text-gray-400">Manage your friends, friend requests, and discover new people</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-400">
                  {isConnected ? 'Connected' : connectionState}
                </span>
                {hubError && (
                  <span className="text-sm text-red-400">({hubError})</span>
                )}
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Friend Requests - Compact */}
            <div className="lg:col-span-1">
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <div className="p-4">
                  <h2 className="text-lg font-semibold text-white mb-3">Requests ({friendRequests.length})</h2>
                  {friendRequests.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No pending requests</p>
                  ) : (
                    <div className="space-y-3">
                      {friendRequests.map((request) => (
                        <div key={`request-${request.requestId}`} className="flex items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                          <MusicImage
                            src={request.requesterAvatar}
                            alt={request.requesterUsername || 'User'}
                            className="w-10 h-10 rounded-full"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">{request.requesterUsername || 'Unknown User'}</p>
                            <p className="text-gray-400 text-xs">
                              {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              }) : 'Unknown'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button
                              onClick={() => handleAcceptRequest(request.requestId)}
                              disabled={processingRequests.has(request.requestId)}
                              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ✓
                            </Button>
                            <Button
                              onClick={() => handleDeclineRequest(request.requestId)}
                              disabled={processingRequests.has(request.requestId)}
                              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Friends & Search Combined */}
            <div className="lg:col-span-3">
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-white">Friends ({friends.length})</h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full sm:w-48 bg-white/10 border-white/20 text-white placeholder-gray-400 text-sm"
                      />
                      <Button
                        onClick={handleSearch}
                        disabled={isSearching || !searchQuery.trim()}
                        className="px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm w-full sm:w-auto"
                      >
                        {isSearching ? '...' : 'Search'}
                      </Button>
                    </div>
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium text-white mb-3">Search Results</h3>
                      <div className="space-y-2">
                        {searchResults.map((user) => (
                          <div key={`search-${user.id}`} className="flex items-center gap-3 p-3 bg-blue-900/20 rounded-lg border border-blue-500/20">
                            <MusicImage
                              src={user.avatarUrl}
                              alt={user.username}
                              className="w-10 h-10 rounded-full"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{user.username}</p>
                              <p className="text-gray-400 text-sm truncate">{user.displayName || user.username}</p>
                            </div>
                            <Button
                              onClick={() => handleSendFriendRequest(user.id)}
                              disabled={sentRequests.has(user.id) || processingRequests.has(user.id)}
                              className={`px-3 py-1 text-sm ${
                                sentRequests.has(user.id) || processingRequests.has(user.id)
                                  ? 'bg-gray-600 cursor-not-allowed'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              {processingRequests.has(user.id) ? 'Sending...' : sentRequests.has(user.id) ? 'Sent' : 'Add'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Friends List */}
                  {friends.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-400 mb-4">No friends yet</p>
                      <p className="text-gray-500 text-sm">Search for users above to add them as friends</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {friends.map((friend) => (
                        <div key={`friend-${friend.id}`} className="flex items-center gap-3 p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                          <MusicImage
                            src={friend.avatarUrl}
                            alt={friend.username}
                            className="w-12 h-12 rounded-full"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{friend.username}</p>
                            <p className="text-gray-400 text-sm">Friend</p>
                          </div>
                          <Button
                            onClick={() => handleRemoveFriend(friend.id)}
                            disabled={processingFriends.has(friend.id)}
                            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingFriends.has(friend.id) ? '...' : 'Remove'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
        
        {/* Toast Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
} 
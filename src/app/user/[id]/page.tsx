"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';

import { Button } from '@/components/ui/Button';
import { UserPlusIcon, CheckIcon, XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import { userApi, identityApi, safeString } from '@/lib/api';


import { eventBus } from '@/lib/eventBus';

interface UserProfile {
  id: string;
  identityUserId: string;
  username: string;
  displayName?: string;
  bio?: string;
  email?: string;
  isPrivate?: boolean;
  followerCount?: number;
  followingCount?: number;
  followers?: number;
  following?: number;
  playlists?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topArtists?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentActivity?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicPlaylists?: any[];
}

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id as string;
  
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<{ status: string; friendshipId?: string; requesterId?: string; addresseeId?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);



  const isOwnProfile = currentUser && profileUser && currentUser.id === profileUser.identityUserId;
  




  useEffect(() => {
    const user = identityApi.getCurrentUser();
    if (!user) {
      setError('Please log in to view profiles');
      setIsLoading(false);
      return;
    }
    
    setCurrentUser(user);

    if (userId) {
      loadUserProfile(userId);
      if (user.id !== userId) {
        loadFriendshipStatus(user.id, userId);
      }
    } else {
      router.replace(`/user/${user.id}`);
    }
  }, [userId, router]);

  // Separate useEffect for event listener to avoid dependency issues
  useEffect(() => {
    const handleFriendshipStatusChanged = (...args: unknown[]) => {
      const [userId1, userId2] = args as [string, string];
      if (currentUser && profileUser && 
          ((userId1 === currentUser.id && userId2 === profileUser.identityUserId) ||
           (userId2 === currentUser.id && userId1 === profileUser.identityUserId))) {
        loadFriendshipStatus(currentUser.id, profileUser.identityUserId);
      }
    };

    eventBus.on('friendshipStatusChanged', handleFriendshipStatusChanged);

    return () => {
      eventBus.off('friendshipStatusChanged', handleFriendshipStatusChanged);
    };
  }, [currentUser?.id, profileUser?.identityUserId]);

  const loadUserProfile = async (identifier: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      let userData: UserProfile | null = null;
      
      try {
        userData = await userApi.getUserProfile(identifier);
      } catch {
        try {
          const searchResults = await userApi.searchUsers(identifier);
          const userByUsername = searchResults.find(user => 
            user.username.toLowerCase() === identifier.toLowerCase()
          );
          if (userByUsername) {
            userData = await userApi.getUserProfile(userByUsername.id);
          }
        } catch {
          // Username search failed, continue with null userData
        }
      }

      if (!userData) {
        setError('User not found');
        setProfileUser(null);
        return;
      }

      setProfileUser({
        id: userData.id,
        identityUserId: userData.identityUserId,
        username: userData.username,
        displayName: userData.displayName,
        bio: userData.bio,
        followerCount: userData.followers || 0,
        followingCount: userData.following || 0,
        playlists: userData.playlists || 0,
        topArtists: [],
        recentActivity: [],
        publicPlaylists: [],
      });

      if (currentUser && userData.identityUserId !== currentUser.id) {
        try {
          const status = await userApi.getFriendshipStatus(currentUser.id, userData.identityUserId);
          setFriendshipStatus(status);
        } catch (error) {
          console.warn('Failed to get friendship status:', error);
          setFriendshipStatus(null);
        }
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setError('Failed to load user profile');
      setProfileUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFriendshipStatus = async (currentUserId: string, targetUserId: string) => {
    try {
      console.log('=== LOADING FRIENDSHIP STATUS ===');
      console.log('currentUserId:', currentUserId);
      console.log('targetUserId:', targetUserId);
      
      const status = await userApi.getFriendshipStatus(currentUserId, targetUserId);
      console.log('Friendship status received:', status);
      setFriendshipStatus(status);
    } catch (error) {
      console.warn('Failed to load friendship status:', error);
      setFriendshipStatus({ status: 'none' });
    }
  };

  const handleSendFriendRequest = async () => {
    console.log('=== SEND FRIEND REQUEST CLICKED ===');
    console.log('currentUser:', currentUser);
    console.log('profileUser:', profileUser);
    console.log('isOwnProfile:', isOwnProfile);
    
    if (!currentUser || !profileUser) return;
    
    // Prevent sending friend request to yourself
    if (isOwnProfile) {
      console.error('Cannot send friend request to yourself');
      return;
    }
    
    setIsLoadingAction(true);
    setShowSuccessMessage(false);
    try {
      console.log('Sending friend request from', currentUser.id, 'to', profileUser.identityUserId);
      await userApi.sendFriendRequest(currentUser.id, profileUser.identityUserId);
      console.log('Friend request sent successfully');
      await loadFriendshipStatus(currentUser.id, profileUser.identityUserId);
      setShowSuccessMessage(true);
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error: unknown) {
      console.error('Failed to send friend request:', error);
      
      // Handle specific error cases
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Friend request already exists')) {
        // Refresh friendship status to show current state
        await loadFriendshipStatus(currentUser.id, profileUser.identityUserId);
      }
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    console.log('=== ACCEPT FRIEND REQUEST CLICKED ===');
    console.log('friendshipStatus:', friendshipStatus);
    console.log('currentUser:', currentUser);
    
    if (!currentUser || !friendshipStatus?.friendshipId) {
      console.log('Missing currentUser or friendshipId');
      return;
    }
    
    setIsLoadingAction(true);
    try {
      console.log('Accepting friend request:', friendshipStatus.friendshipId);
      await userApi.acceptFriendRequest(friendshipStatus.friendshipId, currentUser.id);
      console.log('Friend request accepted successfully');
      await loadFriendshipStatus(currentUser.id, profileUser!.identityUserId);
      // Refresh friendship status instead of full page reload
      setTimeout(() => {
        loadFriendshipStatus(currentUser.id, profileUser!.identityUserId);
      }, 1000);
    } catch {
      console.error('Failed to accept friend request');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleDeclineFriendRequest = async () => {
    console.log('=== DECLINE FRIEND REQUEST CLICKED ===');
    console.log('friendshipStatus:', friendshipStatus);
    console.log('currentUser:', currentUser);
    
    if (!currentUser || !friendshipStatus?.friendshipId) {
      console.log('Missing currentUser or friendshipId');
      return;
    }
    
    setIsLoadingAction(true);
    try {
      console.log('Declining friend request:', friendshipStatus.friendshipId);
      await userApi.declineFriendRequest(friendshipStatus.friendshipId, currentUser.id);
      console.log('Friend request declined successfully');
      await loadFriendshipStatus(currentUser.id, profileUser!.identityUserId);
      // Refresh friendship status instead of full page reload
      setTimeout(() => {
        loadFriendshipStatus(currentUser.id, profileUser!.identityUserId);
      }, 1000);
    } catch {
      console.error('Failed to decline friend request');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!currentUser || !friendshipStatus?.friendshipId) return;
    
    if (!window.confirm('Are you sure you want to remove this friend?')) return;
    
    setIsLoadingAction(true);
    try {
      await userApi.removeFriend(friendshipStatus.friendshipId, currentUser.id);
      await loadFriendshipStatus(currentUser.id, profileUser!.identityUserId);
    } catch {
      console.error('Failed to remove friend');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleMessage = async () => {
    if (!currentUser || !profileUser) return;
    
    try {
      const chat = await userApi.createOrGetChat([currentUser.id, profileUser.id]);
      router.push(`/chat/${chat.chatId}`);
    } catch {
      console.error('Failed to create chat');
    }
  };

  const handleEditProfile = () => {
    router.push('/user/edit');
  };



  const renderActionButtons = () => {
    if (isOwnProfile) {
      return (
        <Button 
          onClick={handleEditProfile} 
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          <PencilIcon className="w-5 h-5 mr-2" />
          Edit Profile
        </Button>
      );
    }

    const status = friendshipStatus?.status || 'none';

    switch (status) {
      case 'accepted':
        return (
          <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Button 
              onClick={handleMessage}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
              Message
            </Button>
            <Button 
              onClick={handleRemoveFriend}
              variant="outline" 
              className="border-red-500 text-red-400 hover:bg-red-500 hover:text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300"
              disabled={isLoadingAction}
            >
              Remove Friend
            </Button>
          </div>
        );
      
      case 'pending':
        // Check if the current user is the one who sent the request
        // The backend returns requesterId, so we need to check if currentUser.id matches it
        const isPendingRequest = friendshipStatus?.requesterId === currentUser?.id;
        console.log('=== PENDING STATUS CHECK ===');
        console.log('friendshipStatus:', friendshipStatus);
        console.log('currentUser.id:', currentUser?.id);
        console.log('friendshipStatus.requesterId:', friendshipStatus?.requesterId);
        console.log('isPendingRequest:', isPendingRequest);
        
        return isPendingRequest ? (
          <div className="flex flex-col items-center space-y-2">
            <Button 
              variant="outline" 
              className="border-yellow-500 text-yellow-400 font-semibold px-8 py-3 rounded-xl"
              disabled
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Friend Request Sent
            </Button>
            <p className="text-sm text-gray-400 text-center">
              Waiting for {profileUser?.displayName || profileUser?.username} to respond
            </p>
            {showSuccessMessage && (
              <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-400 text-center">
                  ✓ Friend request sent successfully!
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Button 
              onClick={handleAcceptFriendRequest}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              disabled={isLoadingAction}
            >
              <CheckIcon className="w-5 h-5 mr-2" />
              Accept Request
            </Button>
            <Button 
              onClick={handleDeclineFriendRequest}
              variant="outline" 
              className="border-gray-500 text-gray-400 hover:bg-gray-500 hover:text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300"
              disabled={isLoadingAction}
            >
              <XMarkIcon className="w-5 h-5 mr-2" />
              Decline
            </Button>
          </div>
        );
      
      case 'blocked':
        return (
          <Button 
            variant="outline" 
            className="border-red-600 text-red-400 font-semibold px-8 py-3 rounded-xl"
            disabled
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
            </svg>
            Blocked
          </Button>
        );
      
      case 'declined':
        // Don't show declined status to the other user - treat it as "none" for privacy
        return (
          <Button 
            onClick={handleSendFriendRequest}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            disabled={isLoadingAction}
          >
            {isLoadingAction ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending Request...
              </>
            ) : (
              <>
                <UserPlusIcon className="w-5 h-5 mr-2" />
                Add Friend
              </>
            )}
          </Button>
        );
      
      default:
        return (
          <Button 
            onClick={handleSendFriendRequest}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            disabled={isLoadingAction}
          >
            {isLoadingAction ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending Request...
              </>
            ) : (
              <>
                <UserPlusIcon className="w-5 h-5 mr-2" />
                Add Friend
              </>
            )}
          </Button>
        );
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
            <span className="text-white">Loading profile...</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !profileUser) {
    return (
      <AppLayout>
        <div className="p-6 text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">User Not Found</h1>
          <p className="text-gray-400">{error || 'This user does not exist.'}</p>
          <div className="flex items-center justify-center space-x-3">
            <Button onClick={() => router.push('/search')} className="bg-green-500 hover:bg-green-600 text-black">
              Search for Users
            </Button>
            <Button onClick={() => router.push('/dashboard')} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">
              Go to Dashboard
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        {/* Hero Section with Background */}
        <div className="relative h-64 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent"></div>
        </div>

        {/* Profile Content */}
        <div className="relative -mt-32 px-6 pb-8">
          {/* Profile Header Card */}
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 mb-8 shadow-2xl">
            <div className="flex flex-col lg:flex-row items-start lg:items-center space-y-6 lg:space-y-0 lg:space-x-8">
              {/* Avatar */}
              <div className="relative">
                <div className="w-32 h-32 lg:w-40 lg:h-40 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-full flex items-center justify-center shadow-2xl border-4 border-gray-800">
                  <span className="text-white font-bold text-4xl lg:text-5xl">
                    {(profileUser.displayName && profileUser.displayName.trim() !== '' ? profileUser.displayName : profileUser.username).charAt(0).toUpperCase()}
                  </span>
                </div>
                {isOwnProfile && (
                  <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg transition-colors">
                    <PencilIcon className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
              
              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full border border-green-500/30">
                        {isOwnProfile ? 'Your Profile' : 'Profile'}
                      </span>
                      {profileUser.isPrivate && (
                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded-full border border-yellow-500/30">
                          Private
                        </span>
                      )}
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-bold text-white">
                      {profileUser.displayName && profileUser.displayName.trim() !== '' ? profileUser.displayName : profileUser.username}
                    </h1>
                    <p className="text-gray-300 text-lg">@{safeString(profileUser.username)}</p>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                    {renderActionButtons()}
                  </div>
                </div>
                
                {/* Bio */}
                <div className="mt-6">
                  {profileUser.bio && profileUser.bio.trim() !== '' ? (
                    <p className="text-gray-300 text-lg leading-relaxed max-w-3xl">{safeString(profileUser.bio)}</p>
                  ) : (
                    <p className="text-gray-500 text-lg italic">
                      {isOwnProfile ? 'Add a bio to tell others about yourself...' : 'No bio yet'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-xl p-6 text-center hover:bg-gray-800/80 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">{profileUser.followerCount || 0}</div>
              <div className="text-gray-400 text-sm font-medium">Followers</div>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-xl p-6 text-center hover:bg-gray-800/80 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">{profileUser.followingCount || 0}</div>
              <div className="text-gray-400 text-sm font-medium">Following</div>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-xl p-6 text-center hover:bg-gray-800/80 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">{profileUser.playlists || 0}</div>
              <div className="text-gray-400 text-sm font-medium">Playlists</div>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Top Artists */}
            {(isOwnProfile || !profileUser.isPrivate) && (
              <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Top Artists</h3>
                  {isOwnProfile && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
                      Private
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  {profileUser.topArtists && profileUser.topArtists.length > 0 ? (
                    profileUser.topArtists.map((artist, index) => (
                      <div key={index} className="flex items-center space-x-4 p-3 hover:bg-gray-700/30 rounded-xl transition-colors">
                        <span className="text-gray-400 font-bold text-lg w-6">{index + 1}</span>
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{safeString(artist.name).charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{safeString(artist.name)}</p>
                          <p className="text-gray-400 text-sm">Artist</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto bg-gray-700/50 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className="text-gray-400 text-sm">No top artists yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="lg:col-span-2 bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-6">Recent Activity</h3>
              <div className="space-y-4">
                {(isOwnProfile || !profileUser.isPrivate) ? (
                  profileUser.recentActivity && profileUser.recentActivity.length > 0 ? (
                    profileUser.recentActivity.map((activity, index) => (
                      <div key={index} className="flex items-center justify-between p-4 hover:bg-gray-700/30 rounded-xl transition-colors">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-white">
                              {activity.action} <span className="font-medium">{activity.item}</span>
                              {activity.artist && <span className="text-gray-400"> by {safeString(activity.artist)}</span>}
                            </p>
                            <p className="text-gray-400 text-sm">{activity.time}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto bg-gray-700/50 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className="text-gray-400 text-sm">No recent activity</p>
                    </div>
                  )
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto bg-gray-700/50 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-gray-400 text-sm">This user&apos;s activity is private</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Public Playlists */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-white mb-6">Public Playlists</h2>
            {profileUser.publicPlaylists && profileUser.publicPlaylists.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {profileUser.publicPlaylists.map((playlist) => (
                  <div key={playlist.id} className="group cursor-pointer">
                    <div className="w-full aspect-square bg-gradient-to-br from-green-500 to-blue-500 rounded-xl mb-3 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                      <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h3 className="text-white font-semibold text-sm truncate">{safeString(playlist.name)}</h3>
                    <p className="text-gray-400 text-xs">By {safeString(profileUser.displayName || profileUser.username)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-gray-800/40 backdrop-blur-sm border border-gray-700 rounded-2xl">
                <div className="w-24 h-24 mx-auto bg-gray-700/50 rounded-full flex items-center justify-center mb-6">
                  <svg className="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-gray-400 text-lg">No public playlists yet</p>
                {isOwnProfile && (
                  <p className="text-gray-500 text-sm mt-2">Create your first playlist to share with others</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Toast notifications */}
      
    </AppLayout>
  );
} 
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import MusicImage from '@/components/ui/MusicImage';
import { userApi, identityApi, Chat, User } from '@/lib/api';
import { notificationService } from '@/lib/notificationService';
import { notificationHub } from '@/lib/notificationHub';

interface ChatWithParticipants extends Chat {
  participantProfiles?: User[];
}

export default function ChatPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [chats, setChats] = useState<ChatWithParticipants[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const loadUnreadCounts = useCallback(async () => {
    try {
      const counts = await userApi.getUnreadMessageCounts();
      setUnreadCounts(counts);
    } catch (error) {
      console.error('Failed to load unread counts:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const user = identityApi.getCurrentUser();
      if (user) {
        // Get the full user profile with IdentityUserId for proper API calls
        const userProfile = await userApi.getCurrentUserProfile();
        setCurrentUser(userProfile || user);

        // Always use IdentityUserId for API calls
        const userId = userProfile?.id || user.id;
        loadUserChats(userId);
        loadUserFriends(userId);
        loadUnreadCounts();
      }
    };
    
    loadData();
  }, [loadUnreadCounts]);

  // Clear current chat ID when on main chat page
  useEffect(() => {
    notificationService.setCurrentChatId(null);
  }, []);

  // Setup notification hub for message notifications
  useEffect(() => {
    if (!currentUser?.id) return;

    // Set up message notification handlers
    notificationHub.setHandlers({
      onNewNotification: (notification: { type?: string; data?: { chatId?: string; senderUsername?: string } }) => {
        if ((notification.type === 'Message' || notification.type === 'message') && notification.data) {
          const { senderUsername } = notification.data;

          // Show toast notification
          addToast(`New message from ${senderUsername}`, 'info');

          // Reload unread counts to update the UI
          loadUnreadCounts();
        }
      },
      onChatUnreadCountUpdate: (data: { chatId: string, unreadCount: number }) => {
        // Update the unread count for this specific chat
        setUnreadCounts(prev => ({
          ...prev,
          [data.chatId]: data.unreadCount
        }));
      }
    }, 'ChatPage');

    return () => {
      notificationHub.removeHandlers('ChatPage');
    };
  }, [currentUser?.id, addToast, loadUnreadCounts]);

  const loadUserChats = async (userId: string) => {
    try {
      const userChats = await userApi.getUserChats(userId);
      
      // Collect all unique participant IDs from all chats
      const allParticipantIds = Array.from(
        new Set(userChats.flatMap(chat => chat.participants))
      );
      
      // Fetch all participant profiles in one batch call
      const participantProfiles = await userApi.getUserProfilesBatch(allParticipantIds);
      
      // Create a lookup map for fast access
      const profileMap = new Map(participantProfiles.map(profile => [profile.id, profile]));
      
      // Map chats with their participant profiles
      const chatsWithProfiles = userChats.map(chat => ({
        ...chat,
        participantProfiles: chat.participants.map(participantId => 
          profileMap.get(participantId) || {
            id: participantId,
            username: `User ${participantId.slice(0, 8)}`,
            displayName: `User ${participantId.slice(0, 8)}`
          } as User
        )
      }));
      
      setChats(chatsWithProfiles);
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserFriends = async (userId: string) => {
    try {
      const friendIds = await userApi.getFriends(userId);
      
      // Fetch all friend profiles in one batch call
      const friendProfiles = await userApi.getUserProfilesBatch(friendIds);
      
      setFriends(friendProfiles);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const handleChatClick = (chatId: string) => {
    router.push(`/chat/${chatId}`);
  };

  const handleStartChat = async (friendId: string) => {
    if (!currentUser) return;

    try {
      const chat = await userApi.createOrGetChat([currentUser.id, friendId]);
      router.push(`/chat/${chat.chatId}`);
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 1) {
      return `${Math.floor(diff / (1000 * 60))}m ago`;
    } else if (hours < 24) {
      return `${Math.floor(hours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getOtherParticipant = (chat: ChatWithParticipants) => {
    const otherParticipantId = chat.participants.find(p => p !== currentUser?.id);
    if (!otherParticipantId || !chat.participantProfiles) return null;
    
    return chat.participantProfiles.find(p => p.id === otherParticipantId);
  };

  if (isLoading) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-white">Loading chats...</div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-3 rounded-lg shadow-lg text-white max-w-sm cursor-pointer transition-opacity ${
              toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
            }`}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Messages</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Chats */}
          <div className="lg:col-span-2">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Recent Conversations</CardTitle>
              </CardHeader>
              <CardContent>
                {chats.length > 0 ? (
                  <div className="space-y-3">
                    {chats.map((chat) => {
                      const otherParticipant = getOtherParticipant(chat);
                      const unreadCount = unreadCounts[chat.chatId] || 0;
                      return (
                        <div
                          key={chat.chatId}
                          onClick={() => handleChatClick(chat.chatId)}
                          className={`flex items-center space-x-4 p-4 rounded-lg cursor-pointer transition-colors ${
                            unreadCount > 0 
                              ? 'bg-blue-900/30 hover:bg-blue-900/50 border-l-4 border-blue-500' 
                              : 'bg-gray-700/50 hover:bg-gray-700/80'
                          }`}
                        >
                          <div className="relative">
                            <MusicImage
                              src={otherParticipant?.avatarUrl}
                              alt={otherParticipant ? (otherParticipant.displayName || otherParticipant.username) : 'User'}
                              fallbackText={otherParticipant ? (otherParticipant.displayName || otherParticipant.username).charAt(0).toUpperCase() : '?'}
                              type="circle"
                              size="medium"
                              className="w-12 h-12"
                            />
                            {unreadCount > 0 && (
                              <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                {unreadCount > 9 ? '9+' : unreadCount}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className={`font-medium truncate ${unreadCount > 0 ? 'text-white' : 'text-white'}`}>
                                {otherParticipant ? (otherParticipant.displayName || otherParticipant.username) : 'Unknown'}
                              </h3>
                              <div className="flex items-center space-x-2">
                                <span className="text-gray-400 text-sm">
                                  {formatTime(chat.lastActivity)}
                                </span>
                                {unreadCount > 0 && (
                                  <div className="bg-blue-500 text-white text-xs rounded-full px-2 py-1 font-bold min-w-[20px] text-center">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className={`text-sm truncate ${unreadCount > 0 ? 'text-gray-300' : 'text-gray-400'}`}>
                              {chat.lastMessageContent ? (
                                chat.lastMessageSenderId === currentUser?.id
                                  ? `You: ${chat.lastMessageContent}`
                                  : chat.lastMessageContent
                              ) : (
                                'No messages yet'
                              )}
                              {unreadCount > 0 && (
                                <span className="ml-2 text-blue-400 font-medium">
                                  • {unreadCount} unread
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-lg mb-2">No conversations yet</div>
                    <p className="text-gray-500">Start a conversation with your friends!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Friends List */}
          <div>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Friends</CardTitle>
                <p className="text-gray-400 text-sm">Start a conversation</p>
              </CardHeader>
              <CardContent>
                {friends.length > 0 ? (
                  <div className="space-y-3">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        onClick={() => handleStartChat(friend.id)}
                        className="flex items-center space-x-3 p-3 rounded-lg bg-gray-700/30 hover:bg-gray-700/60 cursor-pointer transition-colors"
                      >
                        <MusicImage
                          src={friend.avatarUrl}
                          alt={friend.displayName || friend.username}
                          fallbackText={(friend.displayName || friend.username).charAt(0).toUpperCase()}
                          type="circle"
                          size="small"
                          className="w-10 h-10"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">{friend.displayName || friend.username}</h4>
                        </div>
                        <div className="flex items-center">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">No friends yet</div>
                    <p className="text-gray-500 text-sm">Add friends to start chatting!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
} 
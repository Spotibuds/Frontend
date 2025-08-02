"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { userApi, identityApi, Chat } from '@/lib/api';

export default function ChatPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const user = identityApi.getCurrentUser();
    setCurrentUser(user);

    if (user) {
      loadUserChats(user.id);
      loadUserFriends(user.id);
    }
  }, []);

  const loadUserChats = async (userId: string) => {
    try {
      const userChats = await userApi.getUserChats(userId);
      setChats(userChats);
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserFriends = async (userId: string) => {
    try {
      const userFriends = await userApi.getFriends(userId);
      setFriends(userFriends);
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

  const getOtherParticipant = (chat: Chat) => {
    return chat.participants.find(p => p !== currentUser?.id);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-white">Loading chats...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
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
                      return (
                        <div
                          key={chat.chatId}
                          onClick={() => handleChatClick(chat.chatId)}
                          className="flex items-center space-x-4 p-4 rounded-lg bg-gray-700/50 hover:bg-gray-700/80 cursor-pointer transition-colors"
                        >
                                                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {otherParticipant ? otherParticipant.charAt(0).toUpperCase() : '?'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="text-white font-medium truncate">
                              {otherParticipant ? `User ${otherParticipant.slice(0, 8)}` : 'Unknown'}
                            </h3>
                              <span className="text-gray-400 text-sm">
                                {formatTime(chat.lastActivity)}
                              </span>
                            </div>
                            <p className="text-gray-400 text-sm truncate">
                              {chat.lastMessageId ? 'Last message available' : 'No messages yet'}
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
                    {friends.map((friendId) => (
                      <div
                        key={friendId}
                        onClick={() => handleStartChat(friendId)}
                        className="flex items-center space-x-3 p-3 rounded-lg bg-gray-700/30 hover:bg-gray-700/60 cursor-pointer transition-colors"
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">
                            {friendId.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">Friend {friendId.slice(0, 8)}</h4>
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
    </AppLayout>
  );
} 
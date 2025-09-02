'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useFriendHub } from '../../../hooks/useFriendHub';
import { userApi, identityApi } from '../../../lib/api';
import { notificationService } from '../../../lib/notificationService';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Toast } from '../../../components/ui/Toast';
import MusicImage from '../../../components/ui/MusicImage';
interface User {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

interface Chat {
  chatId: string;
  isGroup: boolean;
  name?: string;
  participants: string[];
  lastActivity: string;
  lastMessageId?: string;
}

interface ChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export default function ChatPage() {
  const params = useParams();
  const chatId = params.id as string;
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<User | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleError = useCallback((error: string) => {
    // Only show toast for actual errors, not transport fallbacks
    if (!error.includes('transport') && !error.includes('WebSocket')) {
      addToast(error, 'error');
    }
  }, [addToast]);

  const handleMessageReceived = useCallback((message: ChatMessage) => {
    // Add incoming message to local state, but check for duplicates first
    setChatMessages(prev => {
      const exists = prev.some(m => m.messageId === message.messageId);
      if (!exists) {
        return [...prev, message].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }
      return prev;
    });
  }, []);

  const handleMessageSent = useCallback((message: ChatMessage) => {
    // Add sent message to local state (in case it wasn't already added)
    setChatMessages(prev => {
      const exists = prev.some(m => m.messageId === message.messageId);
      if (!exists) {
        return [...prev, message].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }
      return prev;
    });
  }, []);

  const handleMessageRead = useCallback((messageId: string) => {
    // Mark message as read in local state
    setChatMessages(prev => prev.map(m => 
      m.messageId === messageId ? { ...m, isRead: true } : m
    ));
  }, []);

  const {
    isConnected,
    connectionState,
    sendMessage: sendSignalRMessage,
    markMessageAsRead: markMessageAsReadSignalR,
  } = useFriendHub({
    userId: currentUser?.id,
    onError: handleError,
    onMessageReceived: handleMessageReceived,
    onMessageSent: handleMessageSent,
    onMessageRead: handleMessageRead
  });

  // Load current user and chat data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get current user from identity API
        const user = identityApi.getCurrentUser();
        if (!user) {
          addToast('User not authenticated', 'error');
          return;
        }
        
        // Get the full user profile with MongoDB _id for proper comparison
        const userProfile = await userApi.getCurrentUserProfile();
        const currentUserData = userProfile || {
          id: user.id,
          username: user.username
        };
        
        setCurrentUser(currentUserData);

        // Load chat data
        const chatData = await userApi.getChat(chatId);

        // Use the chatData directly since it matches the Chat type from api.ts
        setChat(chatData);

        // Load other participant's profile
        const otherParticipantId = chatData.participants.find(p => p !== currentUserData.id);
        if (otherParticipantId) {
          try {
            const otherUser = await userApi.getUserProfile(otherParticipantId);
            setOtherParticipant(otherUser);
          } catch (error) {
            console.error('Failed to fetch other participant profile:', error);
            // Set fallback user info
            setOtherParticipant({
              id: otherParticipantId,
              username: `User ${otherParticipantId.slice(0, 8)}`,
              displayName: `User ${otherParticipantId.slice(0, 8)}`
            });
          }
        }

        // Load chat messages
        const messages = await userApi.getChatMessages(chatId);
        // Convert API messages to ChatMessage format
        const formattedMessages: ChatMessage[] = messages.map(msg => ({
          messageId: msg.messageId,
          chatId: msg.chatId,
          senderId: msg.senderId,
          senderName: msg.senderName || 'Unknown User',
          content: msg.content,
          timestamp: msg.sentAt,
          isRead: msg.readBy.length > 0
        }));
        // Sort messages by timestamp ascending (oldest first)
        const sortedMessages = formattedMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setChatMessages(sortedMessages);
      } catch (error) {
        console.error('Failed to load chat data:', error);
        addToast('Failed to load chat', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]); // Remove addToast from dependencies to prevent infinite loops

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !isConnected || !currentUser) return;

    try {
      // Send message via SignalR for real-time delivery
      await sendSignalRMessage(chatId, message.trim());
      setMessage('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      addToast('Failed to send message', 'error');
    }
  }, [message, isConnected, currentUser, sendSignalRMessage, chatId, addToast]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Set current chat ID for notification service
  useEffect(() => {
    if (chatId) {
      notificationService.setCurrentChatId(chatId);
    }
    
    return () => {
      notificationService.setCurrentChatId(null);
    };
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  // Track which messages have been marked as read to avoid infinite loops
  const processedMessagesRef = useRef(new Set<string>());
  const pendingRetryRef = useRef(new Set<string>());

  useEffect(() => {
    // Mark messages as read when chat is opened and SignalR is connected
    if (chatMessages.length > 0 && currentUser && isConnected) {
      const unreadMessages = chatMessages.filter(msg =>
        !msg.isRead &&
        msg.senderId !== currentUser.id &&
        !processedMessagesRef.current.has(msg.messageId)
      );

      unreadMessages.forEach(async (msg) => {
        // Mark this message as being processed
        processedMessagesRef.current.add(msg.messageId);

        try {
          // Mark as read via SignalR for real-time updates
          await markMessageAsReadSignalR(msg.messageId);

          // Also mark via API for persistence (backup)
          try {
            await userApi.markMessageAsRead(msg.messageId);
          } catch (apiError) {
            console.warn('API mark as read failed, but SignalR succeeded:', apiError);
          }

          // Update local state
          setChatMessages(prev => prev.map(m =>
            m.messageId === msg.messageId ? { ...m, isRead: true } : m
          ));
        } catch (error) {
          console.error('Failed to mark message as read:', error);
          // Remove from processed set on error so it can be retried, and queue for reconnect
          processedMessagesRef.current.delete(msg.messageId);
          pendingRetryRef.current.add(msg.messageId);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length, currentUser?.id, markMessageAsReadSignalR, isConnected]);

  // Retry any failed read acknowledgements once the connection is back
  useEffect(() => {
    if (!isConnected || !currentUser) return;
    if (pendingRetryRef.current.size === 0) return;

    const retry = async () => {
      const ids = Array.from(pendingRetryRef.current);
      for (const id of ids) {
        try {
          await markMessageAsReadSignalR(id);
          try {
            await userApi.markMessageAsRead(id);
          } catch {}
          setChatMessages(prev => prev.map(m => m.messageId === id ? { ...m, isRead: true } : m));
          pendingRetryRef.current.delete(id);
          processedMessagesRef.current.add(id);
  } catch {
          // Keep it in the retry set; will retry on next reconnect
        }
      }
    };

    retry();
  }, [isConnected, currentUser, markMessageAsReadSignalR, setChatMessages]);

  if (isLoading) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading chat...</p>
          </div>
        </div>
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
            <p className="text-gray-400">Please log in to access this chat.</p>
          </div>
        </div>
      </>
    );
  }

  if (!chat) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Chat Not Found</h2>
            <p className="text-gray-400">This chat doesn&apos;t exist or you don&apos;t have access to it.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
  <div className="fixed inset-x-0 top-16 bottom-28 lg:left-64">
        <div className="flex flex-col h-full">
          {/* Chat Header */}
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MusicImage
                  src={otherParticipant?.avatarUrl}
                  alt={otherParticipant ? (otherParticipant.displayName || otherParticipant.username) : 'Unknown User'}
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <h1 className="text-lg font-semibold text-white">
                    {otherParticipant ? (otherParticipant.displayName || otherParticipant.username) : 'Unknown User'}
                  </h1>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="text-gray-400">
                      {connectionState === 'Connected' ? 'Online' : connectionState}
                    </span>
                  </div>
                </div>
              </div>

              
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No messages yet</h3>
              <p className="text-gray-400">Start the conversation by sending a message!</p>
            </div>
          ) : (
            chatMessages.map((msg) => {
              // Use IdentityUserId for comparison since that's what we're using consistently
              const isOwnMessage = msg.senderId === currentUser?.id;
              
              return (
                <div
                  key={msg.messageId}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        {isOwnMessage ? 'You' : msg.senderName}
                      </span>
                      <span className="text-xs opacity-70">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-sm">{msg.content}</p>
                    {isOwnMessage && (
                      <div className="flex justify-end mt-1">
                        <span className="text-xs opacity-70">
                          {msg.isRead ? '✓✓' : '✓'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-4">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
                disabled={!isConnected}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!message.trim() || !isConnected}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </Button>
            </div>
          </div>
        </div>

        {/* Toasts */}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </>
  );
}
import { useEffect, useState, useCallback, useRef } from 'react';
import { friendHubManager, FriendRequest, Friend, ChatMessage, Chat } from '../lib/friendHub';
import { eventBus } from '../lib/eventBus';

interface UseFriendHubOptions {
  userId?: string;
  autoConnect?: boolean;
  onError?: (error: string) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onMessageRead?: (messageId: string) => void;
}

interface FriendHubState {
  isConnected: boolean;
  connectionState: string;
  friends: Friend[];
  friendRequests: FriendRequest[];
  chats: Chat[];
  messages: Record<string, ChatMessage[]>;
  onlineFriends: string[];
  error: string | null;
  lastFriendRequestReceived?: FriendRequest;
  lastFriendRequestAccepted?: { requestId: string; friendId: string; friendName: string; friendAvatar?: string };
  lastFriendRequestDeclined?: { requestId: string };
  lastFriendRequestSent?: { requestId: string; targetUserId: string; timestamp: string };
  lastFriendAdded?: { friendId: string; friendName: string; friendAvatar?: string };
  lastFriendRemoved?: { friendId: string };
}

export const useFriendHub = (options: UseFriendHubOptions = {}) => {
  const { userId, autoConnect = true, onError, onMessageReceived, onMessageSent, onMessageRead } = options;
  
  const [state, setState] = useState<FriendHubState>({
    isConnected: false,
    connectionState: 'Disconnected',
    friends: [],
    friendRequests: [],
    chats: [],
    messages: {},
    onlineFriends: [],
    error: null,
    lastFriendRequestReceived: undefined,
    lastFriendRequestAccepted: undefined,
    lastFriendRequestDeclined: undefined,
    lastFriendRequestSent: undefined,
    lastFriendAdded: undefined,
    lastFriendRemoved: undefined
  });

  const connectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // Stabilize callback functions to prevent infinite loops
  const stableOnError = useCallback((error: string) => {
    onError?.(error);
  }, [onError]);
  
  const stableOnMessageReceived = useCallback((message: ChatMessage) => {
    onMessageReceived?.(message);
  }, [onMessageReceived]);
  
  const stableOnMessageSent = useCallback((message: ChatMessage) => {
    onMessageSent?.(message);
  }, [onMessageSent]);
  
  const stableOnMessageRead = useCallback((messageId: string) => {
    onMessageRead?.(messageId);
  }, [onMessageRead]);

  // Connection Management
  const connect = useCallback(async () => {
    if (!userId) {
      setState(prev => ({ ...prev, error: 'User ID is required to connect' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, error: null }));
      await friendHubManager.connect(userId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
    }
  }, [userId, stableOnError]);

  const disconnect = useCallback(async () => {
    try {
    await friendHubManager.disconnect();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }, []);

  // Friend Management
  const sendFriendRequest = useCallback(async (targetUserId: string) => {
    try {
      await friendHubManager.sendFriendRequest(targetUserId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send friend request';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  const acceptFriendRequest = useCallback(async (requestId: string) => {
    try {
      await friendHubManager.acceptFriendRequest(requestId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to accept friend request';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  const declineFriendRequest = useCallback(async (requestId: string) => {
    try {
      await friendHubManager.declineFriendRequest(requestId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to decline friend request';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  const removeFriend = useCallback(async (friendId: string) => {
    try {
      await friendHubManager.removeFriend(friendId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove friend';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  // Chat Management
  const sendMessage = useCallback(async (chatId: string, message: string) => {
    try {
      await friendHubManager.sendMessage(chatId, message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  const markMessageAsRead = useCallback(async (messageId: string) => {
    try {
      await friendHubManager.markMessageAsRead(messageId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to mark message as read';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  const createChat = useCallback(async (friendId: string) => {
    try {
      await friendHubManager.createChat(friendId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create chat';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  const getOnlineFriends = useCallback(async () => {
    try {
      await friendHubManager.getOnlineFriends();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get online friends';
      setState(prev => ({ ...prev, error: errorMessage }));
      stableOnError(errorMessage);
      throw error;
    }
  }, [stableOnError]);

  // Create a stable reference for getOnlineFriends that doesn't cause re-renders
  const stableGetOnlineFriends = useCallback(() => {
    friendHubManager.getOnlineFriends().catch(console.error);
  }, []);

  // Utility Functions
  const getChatMessages = useCallback((chatId: string): ChatMessage[] => {
    return state.messages[chatId] || [];
  }, [state.messages]);

  const getChat = useCallback((chatId: string): Chat | undefined => {
    return state.chats.find(chat => chat.id === chatId);
  }, [state.chats]);

  const getFriend = useCallback((friendId: string): Friend | undefined => {
    return state.friends.find(friend => friend.id === friendId);
  }, [state.friends]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const clearLastEvents = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastFriendRequestReceived: undefined,
      lastFriendRequestAccepted: undefined,
      lastFriendRequestDeclined: undefined,
      lastFriendRequestSent: undefined,
      lastFriendRemoved: undefined
    }));
  }, []);

  // Setup event handlers
  useEffect(() => {
    // Set up online friends event handler FIRST
    friendHubManager.setOnOnlineFriendsReceived((onlineFriends) => {
      setState(prev => ({
        ...prev,
        onlineFriends
      }));
    });

    // Connection state changes
    friendHubManager.setOnConnectionStateChanged((connectionState) => {
      setState(prev => ({
        ...prev,
        connectionState,
        isConnected: connectionState === 'Connected'
      }));
      
      // Get online friends when connected with a small delay to ensure handlers are set up
      if (connectionState === 'Connected') {
        setTimeout(() => {
          stableGetOnlineFriends();
        }, 100);
      }
    });

    // Friend request events
    friendHubManager.setOnFriendRequestReceived((request) => {
      setState(prev => ({
        ...prev,
        friendRequests: [...prev.friendRequests, request],
        lastFriendRequestReceived: request
      }));
    });

    friendHubManager.setOnFriendRequestAccepted((data) => {
      console.log('🔥 useFriendHub: FriendRequestAccepted received:', data);
      console.log('🔥 useFriendHub: Current userId:', userId);
      console.log('🔥 useFriendHub: data.friendId:', data.friendId);
      console.log('🔥 useFriendHub: data.FriendId:', data.FriendId);
      setState(prev => ({
        ...prev,
        friendRequests: prev.friendRequests.filter(req => req.requestId !== data.requestId),
        friends: [...prev.friends, {
          id: data.friendId || data.FriendId,
          username: data.friendName || data.FriendName,
          avatarUrl: data.friendAvatar || data.FriendAvatar,
          isOnline: false
        }],
        lastFriendRequestAccepted: {
          requestId: data.requestId || data.RequestId,
          friendId: data.friendId || data.FriendId,
          friendName: data.friendName || data.FriendName,
          friendAvatar: data.friendAvatar || data.FriendAvatar
        }
      }));
      
      // Emit friendship status changed event for user profile page updates
      const friendId = data.friendId || data.FriendId;
      if (userId && friendId) {
        console.log('🔥 useFriendHub: Emitting friendshipStatusChanged event:', userId, friendId);
        eventBus.emit('friendshipStatusChanged', userId, friendId);
      } else {
        console.log('🔥 useFriendHub: NOT emitting friendshipStatusChanged - userId:', userId, 'friendId:', friendId);
      }
    });

    friendHubManager.setOnFriendRequestDeclined((data) => {
      setState(prev => {
        // Get the declined request before removing it
        const declinedRequest = prev.friendRequests.find(req => req.requestId === data.requestId);
        
        // Emit friendship status changed event for user profile page updates
        if (userId && declinedRequest) {
          eventBus.emit('friendshipStatusChanged', userId, declinedRequest.senderId);
        }
        
        return {
          ...prev,
          friendRequests: prev.friendRequests.filter(req => req.requestId !== data.requestId),
          lastFriendRequestDeclined: { requestId: data.requestId }
        };
      });
    });

    friendHubManager.setOnFriendAdded((data) => {
      console.log('🔥 useFriendHub: FriendAdded received:', data);
      console.log('🔥 useFriendHub: Current userId:', userId);
      console.log('🔥 useFriendHub: data.friendId:', data.friendId);
      console.log('🔥 useFriendHub: data.FriendId:', data.FriendId);
      setState(prev => ({
        ...prev,
        friends: [...prev.friends, {
          id: data.friendId || data.FriendId,
          username: data.friendName || data.FriendName,
          avatarUrl: data.friendAvatar || data.FriendAvatar,
          isOnline: false
        }],
        lastFriendAdded: {
          friendId: data.friendId || data.FriendId,
          friendName: data.friendName || data.FriendName,
          friendAvatar: data.friendAvatar || data.FriendAvatar
        }
      }));
      
      // Emit friendship status changed event for user profile page updates
      const friendId = data.friendId || data.FriendId;
      if (userId && friendId) {
        console.log('🔥 useFriendHub: Emitting friendshipStatusChanged for FriendAdded:', userId, friendId);
        eventBus.emit('friendshipStatusChanged', userId, friendId);
      } else {
        console.log('🔥 useFriendHub: NOT emitting friendshipStatusChanged for FriendAdded - userId:', userId, 'friendId:', friendId);
      }
    });

    friendHubManager.setOnFriendRequestSent((data) => {
      setState(prev => ({
        ...prev,
        lastFriendRequestSent: {
          requestId: data.requestId,
          targetUserId: data.targetUserId,
          timestamp: data.timestamp
        }
      }));
      
      // Emit friendship status changed event for user profile page updates
      if (userId && data.targetUserId) {
        eventBus.emit('friendshipStatusChanged', userId, data.targetUserId);
      }
    });

    friendHubManager.setOnFriendRemoved((data) => {
      console.log('🔥 useFriendHub: FriendRemoved received:', data);
      const removedFriendId = data.RemovedFriendId || data.removedFriendId; // Handle both cases
      setState(prev => ({
        ...prev,
        friends: prev.friends.filter(friend => friend.id !== removedFriendId),
        chats: prev.chats.filter(chat => !chat.participants.includes(removedFriendId)),
        lastFriendRemoved: { friendId: removedFriendId }
      }));
      
      // Emit friendship status changed event for user profile page updates
      if (userId && removedFriendId) {
        console.log('🔥 useFriendHub: Emitting friendshipStatusChanged for friend removal:', userId, removedFriendId);
        eventBus.emit('friendshipStatusChanged', userId, removedFriendId);
      } else {
        console.log('🔥 useFriendHub: NOT emitting friendshipStatusChanged for removal - userId:', userId, 'removedFriendId:', removedFriendId);
      }
    });

    friendHubManager.setOnFriendStatusChanged((data) => {
      setState(prev => ({
        ...prev,
        friends: prev.friends.map(friend =>
          friend.id === data.friendId
            ? { ...friend, isOnline: data.isOnline }
            : friend
        )
      }));
    });

    // Chat events
    friendHubManager.setOnMessageReceived((message) => {
      setState(prev => ({
        ...prev,
        messages: {
          ...prev.messages,
          [message.chatId]: [...(prev.messages[message.chatId] || []), message]
        },
        chats: prev.chats.map(chat =>
          chat.id === message.chatId
            ? {
                ...chat,
                lastMessage: message.content,
                lastMessageAt: message.timestamp,
                unreadCount: chat.unreadCount + 1
              }
            : chat
        )
      }));
      
      // Call the callback if provided
      stableOnMessageReceived(message);
    });

    friendHubManager.setOnMessageSent((data) => {
      console.log('useFriendHub: MessageSent data received:', data);
      
      // Create a properly formatted message object
      const sentMessage: ChatMessage = {
        chatId: data.chatId,
        messageId: data.messageId,
        senderId: data.senderId || userId || '', // Use senderId from data
        senderName: data.senderName || 'You',   // Use senderName from data
        content: data.content,
        timestamp: data.timestamp,
        isRead: false
      };
      
      console.log('useFriendHub: Created sentMessage:', sentMessage);
      
      setState(prev => ({
        ...prev,
        messages: {
          ...prev.messages,
          [data.chatId]: [...(prev.messages[data.chatId] || []), sentMessage]
        }
      }));
      
      // Call the callback if provided
      stableOnMessageSent(sentMessage);
    });

    friendHubManager.setOnMessageRead((data) => {
      setState(prev => ({
        ...prev,
        messages: {
          ...prev.messages,
          [data.chatId]: (prev.messages[data.chatId] || []).map(msg =>
            msg.messageId === data.messageId
              ? { ...msg, isRead: true }
              : msg
          )
        }
      }));
      
      // Call the callback if provided
      stableOnMessageRead(data.messageId);
    });

    friendHubManager.setOnChatCreated((chat) => {
      setState(prev => ({
        ...prev,
        chats: [...prev.chats, { ...chat, unreadCount: 0 }]
      }));
    });

    // Error handling
    friendHubManager.setOnError((error) => {
      setState(prev => ({ ...prev, error }));
      stableOnError(error);
    });

    return () => {
      // Cleanup event handlers
      friendHubManager.setOnFriendRequestReceived(null);
      friendHubManager.setOnFriendRequestAccepted(null);
      friendHubManager.setOnFriendRequestDeclined(null);
      friendHubManager.setOnFriendRequestSent(null);
      friendHubManager.setOnFriendRemoved(null);
      friendHubManager.setOnFriendStatusChanged(null);
      friendHubManager.setOnMessageReceived(null);
      friendHubManager.setOnMessageSent(null);
      friendHubManager.setOnMessageRead(null);
      friendHubManager.setOnChatCreated(null);
      friendHubManager.setOnError(null);
      friendHubManager.setOnConnectionStateChanged(null);
    };
  }, [userId, stableOnError, stableOnMessageReceived, stableOnMessageSent, stableOnMessageRead, stableGetOnlineFriends]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && userId) {
      connect();
    }

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentTimeout = connectionTimeoutRef.current;
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    };
  }, [autoConnect, userId, connect]);

    // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // State
    ...state,
    
    // Connection Management
    connect,
    disconnect,
    
    // Friend Management
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    
    // Chat Management
    sendMessage,
    markMessageAsRead,
    createChat,
    getOnlineFriends,
    
    // Utility Functions
    getChatMessages,
    getChat,
    getFriend,
    clearError,
    clearLastEvents
  };
}; 
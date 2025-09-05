"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { FriendRequest } from '@/lib/friendHub';

// Notification types
export interface BaseNotification {
  id: string;
  type: 'friend_request_received' | 'friend_request_accepted' | 'friend_request_declined' | 'friend_removed' | 'message';
  title: string;
  message: string;
  data: Record<string, unknown> | FriendRequest;
  timestamp: Date;
  read: boolean;
}

export interface FriendNotification extends BaseNotification {
  type: 'friend_request_received' | 'friend_request_accepted' | 'friend_request_declined' | 'friend_removed';
}

export interface MessageNotification extends BaseNotification {
  type: 'message';
  data: {
    chatId: string;
    messageId: string;
    senderUsername: string;
    senderAvatar?: string;
  };
}

export type AppNotification = FriendNotification | MessageNotification;

export interface NotificationContextType {
  // Notifications state
  notifications: AppNotification[];
  unreadCount: number;
  
  // Friend requests specifically 
  friendRequests: Array<{
    requestId: string;
    requesterId: string;
    requesterUsername: string;
    requesterAvatar?: string;
    requestedAt: string;
  }>;
  
  // Actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  
  // Friend request specific actions
  addFriendRequest: (request: FriendRequest) => void;
  removeFriendRequest: (requestId: string) => void;
  clearFriendRequests: () => void;
  updateFriendRequestsList: (requests: FriendRequest[]) => void;
  
  // Message notification specific actions
  addMessageNotification: (notification: Omit<MessageNotification, 'id' | 'timestamp'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [friendRequests, setFriendRequests] = useState<Array<{
    requestId: string;
    requesterId: string;
    requesterUsername: string;
    requesterAvatar?: string;
    requestedAt: string;
  }>>([]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'timestamp'>) => {
    const newNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    } as AppNotification;
    
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const addMessageNotification = useCallback((notification: Omit<MessageNotification, 'id' | 'timestamp'>) => {
    const newNotification: MessageNotification = {
      ...notification,
      id: `msg_notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const addFriendRequest = useCallback((request: FriendRequest) => {
    setFriendRequests(prev => {
      // Check if request already exists
      const exists = prev.some(r => r.requestId === request.requestId);
      if (exists) return prev;
      
      return [...prev, {
        requestId: request.requestId,
        requesterId: request.senderId,
        requesterUsername: request.senderName,
        requesterAvatar: request.senderAvatar,
        requestedAt: request.timestamp,
      }];
    });

    // Also add as notification
    addNotification({
      type: 'friend_request_received',
      title: 'New Friend Request',
      message: `${request.senderName} sent you a friend request`,
      data: request,
      read: false,
    });
  }, [addNotification]);

  const removeFriendRequest = useCallback((requestId: string) => {
    setFriendRequests(prev => prev.filter(r => r.requestId !== requestId));
    
    // Also remove related notification
    setNotifications(prev => prev.filter(n => 
      !(n.type === 'friend_request_received' && n.data?.requestId === requestId)
    ));
  }, []);

  const clearFriendRequests = useCallback(() => {
    setFriendRequests([]);
  }, []);

  const updateFriendRequestsList = useCallback((requests: FriendRequest[]) => {
    const formattedRequests = requests.map(req => ({
      requestId: req.requestId,
      requesterId: req.senderId,
      requesterUsername: req.senderName,
      requesterAvatar: req.senderAvatar,
      requestedAt: req.timestamp,
    }));
    
    setFriendRequests(formattedRequests);
  }, []);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    friendRequests,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    addFriendRequest,
    removeFriendRequest,
    clearFriendRequests,
    updateFriendRequestsList,
    addMessageNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { BellIcon, CheckIcon, XMarkIcon, UserPlusIcon, UserMinusIcon, HeartIcon } from "@heroicons/react/24/outline";
import { BellIcon as BellIconSolid } from "@heroicons/react/24/solid";
import { notificationHub, RealtimeNotification, NotificationHandlers } from "@/lib/notificationHub";
import { notificationsApi, type Notification } from "@/lib/api";
import { userApi } from "@/lib/api";

interface NotificationDropdownProps {
  userId: string;
  isLoggedIn: boolean;
  onNotificationAction?: (type: string, data: any) => void;
}

export default function NotificationDropdown({ 
  userId, 
  isLoggedIn, 
  onNotificationAction 
}: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('Disconnected');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load notifications from API
  const loadNotifications = useCallback(async () => {
    if (!isLoggedIn || !userId) return;

    setIsLoading(true);
    try {
      const response = await notificationsApi.getNotifications(userId, 20, 0);
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, userId]);

  // Setup SignalR handlers
  useEffect(() => {
    if (!isLoggedIn || !userId) return;

    // Get current connection state when component mounts
    const currentState = notificationHub.getConnectionState();
    setConnectionState(currentState.toString());

    // Periodically check connection state (as fallback)
    const connectionCheckInterval = setInterval(() => {
      const state = notificationHub.getConnectionState();
      setConnectionState(prev => {
        const newState = state.toString();
        if (prev !== newState) {
          console.log(`🔔 Connection state changed from ${prev} to ${newState}`);
        }
        return newState;
      });
    }, 2000); // Check every 2 seconds

    const handlers: NotificationHandlers = {
      onNewNotification: (notification: RealtimeNotification) => {
        console.log('🔔 New real-time notification:', notification);
        
        // Add to local notifications list
        const newNotification: Notification = {
          id: `temp-${Date.now()}`, // Temporary ID for real-time notifications
          targetUserId: userId,
          sourceUserId: notification.sourceUserId,
          type: notification.type as any,
          status: 'Unread',
          title: notification.title,
          message: notification.message,
          data: notification.data,
          createdAt: notification.timestamp
        };

        setNotifications(prev => [newNotification, ...prev]);
        // Increment unread count for the new notification
        setUnreadCount(prev => prev + 1);
        
        // Show browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
          new window.Notification(notification.title, {
            body: notification.message,
            icon: '/logo.svg',
            badge: '/logo.svg'
          });
        }
      },

      onUnreadCountUpdate: (count: number) => {
        console.log('🔔 Unread count updated:', count);
        setUnreadCount(count);
      },

      onNotificationMarkedRead: (notificationId: string) => {
        setNotifications(prev => 
          prev.map(n => n.id === notificationId ? { ...n, status: 'Read' as const } : n)
        );
      },

      onNotificationHandled: (notificationId: string) => {
        setNotifications(prev => 
          prev.filter(n => n.id !== notificationId)
        );
      },

      onAllNotificationsMarkedRead: () => {
        setNotifications(prev => 
          prev.map(n => ({ ...n, status: 'Read' as const }))
        );
        setUnreadCount(0);
      },

      onNotificationsLoaded: (data) => {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      },

      onConnectionStateChange: (state) => {
        setConnectionState(state.toString());
      },

      onError: (error) => {
        console.error('🔔 Notification hub error:', error);
      }
    };

    notificationHub.setHandlers(handlers, 'NotificationDropdown');
    
    // Load initial notifications
    loadNotifications();

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      // Clear connection check interval
      clearInterval(connectionCheckInterval);
      // Remove only this component's handlers
      notificationHub.removeHandlers('NotificationDropdown');
    };
  }, [isLoggedIn, userId]); // Removed loadNotifications to prevent duplicate handlers

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    // Skip API calls for temporary notifications (real-time ones)
    if (notificationId.startsWith('temp-')) {
      // Only call SignalR hub for temporary notifications
      await notificationHub.markAsRead(notificationId);
      return;
    }
    
    await notificationHub.markAsRead(notificationId);
    // Also call API as fallback for real notifications
    await notificationsApi.markAsRead(notificationId, userId);
  }, [userId]);

  const handleMarkAsHandled = useCallback(async (notificationId: string) => {
    // Skip API calls for temporary notifications (real-time ones)
    if (notificationId.startsWith('temp-')) {
      // Only call SignalR hub for temporary notifications
      await notificationHub.markAsHandled(notificationId);
      return;
    }
    
    await notificationHub.markAsHandled(notificationId);
    // Also call API as fallback for real notifications
    await notificationsApi.markAsHandled(notificationId, userId);
  }, [userId]);

  const handleMarkAllAsRead = useCallback(async () => {
    await notificationHub.markAllAsRead();
    // Also call API as fallback
    await notificationsApi.markAllAsRead(userId);
  }, [userId]);

  const handleFriendAction = useCallback(async (action: 'accept' | 'decline', requestId: string, senderId: string) => {
    try {
      if (action === 'accept') {
        await userApi.acceptFriendRequest(requestId, userId);
        onNotificationAction?.('friend_accepted', { requestId, senderId });
      } else {
        await userApi.declineFriendRequest(requestId, userId);
        onNotificationAction?.('friend_declined', { requestId, senderId });
      }

      // Mark notification as handled
      const notification = notifications.find(n => 
        n.type === 'FriendRequest' && 
        n.data.requestId === requestId
      );
      
      if (notification) {
        await handleMarkAsHandled(notification.id);
      }
    } catch (error) {
      console.error(`Failed to ${action} friend request:`, error);
    }
  }, [userId, notifications, onNotificationAction, handleMarkAsHandled]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'FriendRequest':
        return <UserPlusIcon className="w-5 h-5 text-blue-500" />;
      case 'FriendRequestAccepted':
        return <UserPlusIcon className="w-5 h-5 text-green-500" />;
      case 'FriendRequestDeclined':
        return <UserMinusIcon className="w-5 h-5 text-red-500" />;
      case 'FriendRemoved':
        return <UserMinusIcon className="w-5 h-5 text-red-500" />;
      case 'Message':
        return <HeartIcon className="w-5 h-5 text-purple-500" />;
      default:
        return <BellIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return time.toLocaleDateString();
  };

  if (!isLoggedIn) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors"
        title="Notifications"
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="w-6 h-6 text-yellow-500" />
        ) : (
          <BellIcon className="w-6 h-6" />
        )}
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        
        {/* Connection status indicator */}
        <span 
          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${
            connectionState === 'Connected' ? 'bg-green-500' : 
            connectionState === 'Connecting' || connectionState === 'Reconnecting' ? 'bg-yellow-500' : 
            'bg-red-500'
          }`}
          title={`SignalR: ${connectionState}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <BellIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      notification.status === 'Unread' ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">
                            {notification.title}
                          </p>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {notification.message}
                        </p>

                        {/* Friend request actions */}
                        {notification.type === 'FriendRequest' && notification.status === 'Unread' && (
                          <div className="flex space-x-2 mt-3">
                            <button
                              onClick={() => handleFriendAction('accept', notification.data.requestId, notification.sourceUserId!)}
                              className="flex items-center px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                            >
                              <CheckIcon className="w-4 h-4 mr-1" />
                              Accept
                            </button>
                            <button
                              onClick={() => handleFriendAction('decline', notification.data.requestId, notification.sourceUserId!)}
                              className="flex items-center px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                            >
                              <XMarkIcon className="w-4 h-4 mr-1" />
                              Decline
                            </button>
                          </div>
                        )}

                        {/* Mark as read button */}
                        {notification.status === 'Unread' && notification.type !== 'FriendRequest' && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="text-xs text-blue-500 hover:text-blue-600 mt-2 transition-colors"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  // Could navigate to full notifications page
                }}
                className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

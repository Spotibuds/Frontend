"use client";

import React, { useState, useEffect, useCallback } from "react";
import { notificationsApi, type Notification } from "@/lib/api";
import { notificationHub, NotificationHandlers } from "@/lib/notificationHub";
import { TrashIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from 'next/navigation';

// Simple time ago function
const timeAgo = (date: Date | string): string => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return past.toLocaleDateString();
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  
  // Get current user from localStorage
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('currentUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    try {
      const response = await notificationsApi.getNotifications(currentUser.id);
      setNotifications(response.notifications);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Setup SignalR handlers for real-time synchronization
  useEffect(() => {
    if (!currentUser?.id) return;

    const handlers: NotificationHandlers = {
      onNewNotification: (notification) => {
        console.log('🔔 New real-time notification received on notifications page:', notification);
        // Reload notifications from API to get the persistent version
        loadNotifications();
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
      },

      onNotificationsLoaded: (data) => {
        setNotifications(data.notifications);
      },

      // Add handlers for dropdown actions
      onUnreadCountUpdate: () => {
        // Reload notifications when count changes from other components
        loadNotifications();
      },

      onConnectionStateChange: () => {},
      onError: (error) => {
        console.error('🔔 Notification hub error on notifications page:', error);
      }
    };

    notificationHub.setHandlers(handlers, 'NotificationsPage');
    
    return () => {
      notificationHub.removeHandlers('NotificationsPage');
    };
  }, [currentUser?.id, loadNotifications]);

  // Listen for events from dropdown
  useEffect(() => {
    const handleNotificationsDeletedAll = () => {
      console.log('📱 Notifications page: Received delete-all event from dropdown');
      setNotifications([]);
    };

    const handleNotificationDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { notificationId } = customEvent.detail || {};
      if (notificationId) {
        console.log('📱 Notifications page: Received delete event for:', notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      }
    };

    window.addEventListener('notifications-deleted-all', handleNotificationsDeletedAll);
    window.addEventListener('notification-deleted', handleNotificationDeleted);

    return () => {
      window.removeEventListener('notifications-deleted-all', handleNotificationsDeletedAll);
      window.removeEventListener('notification-deleted', handleNotificationDeleted);
    };
  }, []);

  // Delete individual notification
  const handleDeleteNotification = async (notificationId: string) => {
    if (!currentUser?.id) return;

    setIsDeleting(notificationId);
    try {
      const success = await notificationsApi.deleteNotification(notificationId, currentUser.id);
      if (success) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        // Notify other components about the deletion
        window.dispatchEvent(new CustomEvent('notification-deleted', {
          detail: { notificationId, userId: currentUser.id }
        }));
        // Also notify SignalR hub
        await notificationHub.markAsHandled(notificationId);
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    } finally {
      setIsDeleting(null);
    }
  };

  // Delete all notifications
  const handleDeleteAllNotifications = async () => {
    if (!currentUser?.id) return;

    setIsDeletingAll(true);
    try {
      const success = await notificationsApi.deleteAllNotifications(currentUser.id);
      if (success) {
        setNotifications([]);
        // Trigger a custom event to notify other components
        window.dispatchEvent(new CustomEvent('notifications-deleted-all', {
          detail: { userId: currentUser.id }
        }));
      }
    } catch (error) {
      console.error('Failed to delete all notifications:', error);
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Mark notification as read
  const handleMarkAsRead = async (notificationId: string) => {
    if (!currentUser?.id) return;

    try {
      await notificationsApi.markAsRead(notificationId, currentUser.id);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, status: 'Read' as const } : n)
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    // Handle different notification types
    if (notification.type === 'Message' && notification.data?.chatId) {
      // Navigate to chat and mark as read
      await handleMarkAsRead(notification.id);
      router.push(`/chat/${notification.data.chatId}`);
    }
    // Add other notification type handlers here if needed
  }, [router, handleMarkAsRead]);

  // Get notification icon based on type
  const getNotificationIcon = (type: string | unknown) => {
    const typeString = String(type || 'Other');
    switch (typeString) {
      case 'FriendRequest':
        return '👤';
      case 'FriendRequestAccepted':
        return '✅';
      case 'FriendRemoved':
        return '❌';
      case 'Message':
        return '💬';
      default:
        return '🔔';
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to view notifications</h1>
          <Link href="/login" className="text-purple-300 hover:text-purple-100">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-4">Notifications</h1>
          
          {notifications.length > 0 && (
            <div className="flex gap-4 mb-6">
              <button
                onClick={handleDeleteAllNotifications}
                disabled={isDeletingAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <TrashIcon className="h-4 w-4" />
                {isDeletingAll ? 'Deleting...' : 'Delete All'}
              </button>
              
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-300"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center text-white">
            <div className="text-6xl mb-4">🔔</div>
            <h2 className="text-2xl font-semibold mb-2">No notifications</h2>
            <p className="text-white/70">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 transition-all hover:bg-white/15 ${
                  notification.status === 'Unread' ? 'ring-2 ring-purple-400/50' : ''
                } ${notification.type === 'Message' ? 'cursor-pointer' : ''}`}
                onClick={() => notification.type === 'Message' ? handleNotificationClick(notification) : undefined}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white truncate">
                          {notification.title}
                        </h3>
                        {notification.status === 'Unread' && (
                          <span className="px-2 py-1 text-xs bg-purple-500 text-white rounded-full">
                            New
                          </span>
                        )}
                      </div>
                      
                      <p className="text-white/80 mb-2">{notification.message}</p>
                      
                      <div className="flex items-center gap-4 text-sm text-white/60">
                        <span>
                          {timeAgo(notification.createdAt)}
                        </span>
                        <span className="capitalize">
                          {typeof notification.type === 'string' 
                            ? notification.type.replace(/([A-Z])/g, ' $1').trim()
                            : String(notification.type || 'Notification')
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {notification.status === 'Unread' && (
                      <button
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="p-2 text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded-lg transition-colors"
                        title="Mark as read"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDeleteNotification(notification.id)}
                      disabled={isDeleting === notification.id}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete notification"
                    >
                      {isDeleting === notification.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"></div>
                      ) : (
                        <XMarkIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

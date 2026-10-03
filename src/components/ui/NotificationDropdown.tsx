"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BellIcon,
  CheckIcon,
  XMarkIcon,
  UserPlusIcon,
  UserMinusIcon,
  TrashIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { BellIcon as BellIconSolid } from "@heroicons/react/24/solid";
import { notificationHub, RealtimeNotification, NotificationHandlers } from "@/lib/notificationHub";
import { notificationsApi, type Notification } from "@/lib/api";
import { userApi } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface NotificationDropdownProps {
  userId: string;
  isLoggedIn: boolean;
  onNotificationAction?: (type: string, data: Record<string, unknown>) => void;
}

export default function NotificationDropdown({
  userId,
  isLoggedIn,
  onNotificationAction,
}: NotificationDropdownProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load notifications from API
  const loadNotifications = useCallback(async () => {
    if (!isLoggedIn || !userId) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const response = await notificationsApi.getNotifications(userId, 20, 0);

      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Notifications could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, userId]);

  // Setup SignalR handlers
  useDeferredEffect(() => {
    if (!isLoggedIn || !userId) return;

    const handlers: NotificationHandlers = {
      onNewNotification: (notification: RealtimeNotification) => {
        // Reload notifications from API to get the persistent version
        // This ensures we have the correct database ID instead of temporary ones
        loadNotifications()
          .then(() => {})
          .catch(error => {
            console.error("🔔 NOTIFICATION DROPDOWN: loadNotifications() failed:", error);
          });

        // Show browser notification if supported and permitted
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(notification.title || "New Notification", {
            body: notification.message || "",
            icon: "/logo.svg",
            badge: "/logo.svg",
          });
        }
      },

      onUnreadCountUpdate: (count: number) => {
        setUnreadCount(count);
      },

      onNotificationMarkedRead: (notificationId: string) => {
        setNotifications(prev =>
          prev.map(n => (n.id === notificationId ? { ...n, status: "Read" as const } : n))
        );
      },

      onNotificationHandled: (notificationId: string) => {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      },

      onAllNotificationsMarkedRead: () => {
        setNotifications(prev => prev.map(n => ({ ...n, status: "Read" as const })));
        setUnreadCount(0);
      },

      onNotificationsLoaded: data => {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      },

      onConnectionStateChange: () => {
        // Just log connection state changes for debugging
      },

      onError: error => {
        console.error("🔔 Notification hub error:", error);
      },
    };

    notificationHub.setHandlers(handlers, "NotificationDropdown");

    // Load initial notifications
    loadNotifications();

    // Request browser notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Listen for custom events from notifications page
    const handleNotificationsDeletedAll = () => {
      setNotifications([]);
      setUnreadCount(0);
    };

    const handleNotificationDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { notificationId } = customEvent.detail || {};
      if (notificationId) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    };

    window.addEventListener("notifications-deleted-all", handleNotificationsDeletedAll);
    window.addEventListener("notification-deleted", handleNotificationDeleted);

    return () => {
      notificationHub.removeHandlers("NotificationDropdown");
      window.removeEventListener("notifications-deleted-all", handleNotificationsDeletedAll);
      window.removeEventListener("notification-deleted", handleNotificationDeleted);
    };
  }, [isLoggedIn, userId, loadNotifications]);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await notificationsApi.markAsRead(notificationId, userId);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Notification could not be marked read.");
        return false;
      }
    },
    [userId]
  );

  const handleMarkAsHandled = useCallback(
    async (notificationId: string) => {
      try {
        await notificationsApi.markAsHandled(notificationId, userId);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Notification action could not be saved."
        );
      }
    },
    [userId]
  );

  const handleDeleteNotification = useCallback(
    async (notificationId: string) => {
      try {
        await notificationsApi.deleteNotification(notificationId, userId);
        // Apply UI state after server confirmation
        setNotifications(prev => prev.filter(n => n.id !== notificationId));

        // Decrease unread count if it was unread
        const notification = notifications.find(n => n.id === notificationId);
        if (notification?.status === "Unread") {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }

        // Notify other components about the deletion
        window.dispatchEvent(
          new CustomEvent("notification-deleted", {
            detail: { notificationId, userId },
          })
        );
      } catch (error) {
        setError(error instanceof Error ? error.message : "Notification deletion failed.");
      }
    },
    [userId, notifications]
  );

  const handleDeleteAllNotifications = useCallback(async () => {
    try {
      await notificationsApi.deleteAllNotifications(userId);
      // Apply UI state after server confirmation
      setNotifications([]);
      setUnreadCount(0);

      // Notify other components about the deletion
      window.dispatchEvent(
        new CustomEvent("notifications-deleted-all", {
          detail: { userId },
        })
      );

      setIsOpen(false); // Close dropdown after deleting all
    } catch (error) {
      setError(error instanceof Error ? error.message : "Notification deletion failed.");
    }
  }, [userId]);

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await notificationsApi.markAllAsRead(userId);
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, status: "Read" as const })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be marked read.");
    }
  }, [userId]);

  const handleFriendAction = useCallback(
    async (action: "accept" | "decline", requestId: string, senderId: string) => {
      try {
        if (action === "accept") {
          await userApi.acceptFriendRequest(requestId, userId);
          onNotificationAction?.("friend_accepted", { requestId, senderId });
        } else {
          await userApi.declineFriendRequest(requestId, userId);
          onNotificationAction?.("friend_declined", { requestId, senderId });
        }

        // Mark notification as handled
        const notification = notifications.find(
          n => n.type === "FriendRequest" && n.data.requestId === requestId
        );

        if (notification) {
          await handleMarkAsHandled(notification.id);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Friend request change failed.");
      }
    },
    [userId, notifications, onNotificationAction, handleMarkAsHandled]
  );

  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      // Handle different notification types
      if (notification.type === "Message" && notification.data?.chatId) {
        // Navigate to chat and mark as read
        if (await handleMarkAsRead(notification.id)) {
          setIsOpen(false);
          router.push(`/chat/${notification.data.chatId}`);
        }
      }
      // Add other notification type handlers here if needed
    },
    [router, handleMarkAsRead]
  );

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "FriendRequest":
        return <UserPlusIcon className="w-5 h-5 text-blue-500" />;
      case "FriendRequestAccepted":
        return <UserPlusIcon className="w-5 h-5 text-green-500" />;
      case "FriendRequestDeclined":
        return <UserMinusIcon className="w-5 h-5 text-red-500" />;
      case "FriendRemoved":
        return <UserMinusIcon className="w-5 h-5 text-red-500" />;
      case "Message":
        return <ChatBubbleLeftIcon className="w-5 h-5 text-blue-500" />;
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

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return time.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:text-gray-900 dark:focus:text-white transition-colors"
      >
        {unreadCount > 0 ? <BellIconSolid className="w-6 h-6" /> : <BellIcon className="w-6 h-6" />}

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white">
                Notifications
              </h3>
              <div className="flex flex-wrap gap-2">
                {notifications.length > 0 && (
                  <button
                    onClick={handleDeleteAllNotifications}
                    className="text-xs sm:text-sm text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
                    title="Delete all notifications"
                  >
                    <TrashIcon className="w-3 h-3" />
                    <span className="hidden sm:inline">Delete all</span>
                    <span className="sm:hidden">Delete</span>
                  </button>
                )}
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs sm:text-sm text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-80 sm:max-h-96 overflow-y-auto">
            {error && (
              <p role="alert" className="p-3 text-red-600">
                {error} <button onClick={loadNotifications}>Retry</button>
              </p>
            )}
            {isLoading ? (
              <div className="p-3 sm:p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                  Loading notifications...
                </p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 sm:p-8 text-center">
                <BellIcon className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
                  No notifications yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    className={`p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      notification.status === "Unread" ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    } ${notification.type === "Message" ? "cursor-pointer" : ""}`}
                    onClick={() =>
                      notification.type === "Message"
                        ? handleNotificationClick(notification)
                        : undefined
                    }
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">{getNotificationIcon(notification.type)}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">
                            {notification.title}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatTimeAgo(notification.createdAt)}
                            </span>
                            <button
                              onClick={() => handleDeleteNotification(notification.id)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete notification"
                            >
                              <XMarkIcon className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {notification.message}
                        </p>

                        {/* Friend request actions */}
                        {notification.type === "FriendRequest" &&
                          notification.status === "Unread" && (
                            <div className="flex flex-col sm:flex-row gap-2 mt-3">
                              <button
                                onClick={() =>
                                  handleFriendAction(
                                    "accept",
                                    String(notification.data.requestId || ""),
                                    notification.sourceUserId!
                                  )
                                }
                                className="flex items-center justify-center px-3 py-2 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                              >
                                <CheckIcon className="w-4 h-4 mr-1" />
                                Accept
                              </button>
                              <button
                                onClick={() =>
                                  handleFriendAction(
                                    "decline",
                                    String(notification.data.requestId || ""),
                                    notification.sourceUserId!
                                  )
                                }
                                className="flex items-center justify-center px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                              >
                                <XMarkIcon className="w-4 h-4 mr-1" />
                                Decline
                              </button>
                            </div>
                          )}

                        {/* Message notification actions */}
                        {notification.type === "Message" && notification.status === "Unread" && (
                          <div className="flex space-x-2 mt-3">
                            <button
                              onClick={() => handleNotificationClick(notification)}
                              className="flex items-center px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                            >
                              <ChatBubbleLeftIcon className="w-4 h-4 mr-1" />
                              View Message
                            </button>
                          </div>
                        )}

                        {/* Mark as read button */}
                        {notification.status === "Unread" &&
                          notification.type !== "FriendRequest" &&
                          notification.type !== "Message" && (
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
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

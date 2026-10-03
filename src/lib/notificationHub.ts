import type { Notification } from "./api";
import { HubConnectionState } from "@microsoft/signalr";
import { ManagedHub } from "./managedHub";
// Notification types
export interface RealtimeNotification {
  type?: string;
  Type?: string;
  title?: string;
  Title?: string;
  message?: string;
  Message?: string;
  sourceUserId?: string;
  SourceUserId?: string;
  sourceUserName?: string;
  SourceUserName?: string;
  sourceUserAvatar?: string;
  SourceUserAvatar?: string;
  data?: Record<string, unknown>;
  Data?: Record<string, unknown>;
  timestamp?: string;
  Timestamp?: string;
  actionUrl?: string;
  ActionUrl?: string;
}

export interface NotificationHandlers {
  onNewNotification?: (notification: RealtimeNotification) => void;
  onUnreadCountUpdate?: (count: number) => void;
  onChatUnreadCountUpdate?: (data: { chatId: string; unreadCount: number }) => void;
  onNotificationMarkedRead?: (notificationId: string) => void;
  onNotificationHandled?: (notificationId: string) => void;
  onAllNotificationsMarkedRead?: () => void;
  onNotificationsLoaded?: (data: { notifications: Notification[]; unreadCount: number }) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: HubConnectionState) => void;
}

class NotificationHubService {
  private subscribers = new Map<string, NotificationHandlers>();
  private hub = new ManagedHub(
    "notification-hub",
    connection => {
      const events = {
        NewNotification: "onNewNotification",
        UnreadCountUpdate: "onUnreadCountUpdate",
        ChatUnreadCountUpdate: "onChatUnreadCountUpdate",
        NotificationMarkedRead: "onNotificationMarkedRead",
        NotificationHandled: "onNotificationHandled",
        AllNotificationsMarkedRead: "onAllNotificationsMarkedRead",
        NotificationsLoaded: "onNotificationsLoaded",
        Error: "onError",
      } as const;
      for (const [event, key] of Object.entries(events))
        connection.on(event, (...args: unknown[]) => {
          for (const handlers of this.subscribers.values()) {
            const handler = handlers[key as keyof NotificationHandlers] as
              | ((...values: unknown[]) => void)
              | undefined;
            handler?.(...args);
          }
        });
    },
    () => undefined,
    state => {
      for (const handlers of this.subscribers.values()) handlers.onConnectionStateChange?.(state);
    }
  );
  setHandlers(handlers: NotificationHandlers, componentId = "default") {
    this.subscribers.set(componentId, handlers);
  }
  removeHandlers(componentId = "default") {
    this.subscribers.delete(componentId);
  }
  enableConnection() {
    return this.hub.start();
  }
  disableConnection() {
    return this.hub.stop();
  }
  disconnect() {
    return this.hub.stop();
  }
  reconnect() {
    return this.hub.start();
  }
  destroy() {
    this.subscribers.clear();
    return this.hub.stop();
  }
  getNotifications(limit = 20, skip = 0) {
    return this.hub.invoke("GetNotifications", limit, skip);
  }
  markAsRead(id: string) {
    return this.hub.invoke("MarkAsRead", id);
  }
  markAsHandled(id: string) {
    return this.hub.invoke("MarkAsHandled", id);
  }
  markAllAsRead() {
    return this.hub.invoke("MarkAllAsRead");
  }
  getConnectionState() {
    return this.hub.state();
  }
}
export const notificationHub = new NotificationHubService();

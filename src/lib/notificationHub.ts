import type { Notification, NotificationResponse } from "./api";
import { HubConnectionState } from "@microsoft/signalr";
import { ManagedHub } from "./managedHub";
import { getSessionGeneration } from "./session";
export type RealtimeNotification = Notification;

export interface NotificationHandlers {
  onNotificationsChanged?: (data: { userId: string }) => void;
  onNotificationDeleted?: (data: { id: string; userId: string }) => void;
  onNewNotification?: (notification: RealtimeNotification) => void;
  onUnreadCountUpdate?: (count: number) => void;
  onChatUnreadCountUpdate?: (data: { chatId: string; unreadCount: number }) => void;
  onNotificationMarkedRead?: (notificationId: string) => void;
  onNotificationHandled?: (notificationId: string) => void;
  onAllNotificationsMarkedRead?: () => void;
  onNotificationsLoaded?: (data: NotificationResponse) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: HubConnectionState) => void;
}

class NotificationHubService {
  private subscribers = new Map<string, NotificationHandlers>();
  private hub = new ManagedHub(
    "notification-hub",
    connection => {
      const generation = getSessionGeneration();
      const events = {
        NewNotification: "onNewNotification",
        NotificationsChanged: "onNotificationsChanged",
        NotificationDeleted: "onNotificationDeleted",
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
          if (this.hub.connection !== connection || generation !== getSessionGeneration()) return;
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
    handlers.onConnectionStateChange?.(this.hub.state());
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
  markAllAsReadThrough(id: string) {
    return this.hub.invoke("MarkAllAsReadThrough", id);
  }
  dismiss(id: string) {
    return this.hub.invoke("Dismiss", id);
  }
  getConnectionState() {
    return this.hub.state();
  }
}
export const notificationHub = new NotificationHubService();

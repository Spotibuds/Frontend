// Global notification service for chat messages
import { ChatMessage } from "./friendHub";

type NotificationHandler = (message: ChatMessage) => void;

class NotificationService {
  private handlers: Set<NotificationHandler> = new Set();
  private seenMessages = new Map<string, number>();
  private currentChatId: string | null = null;

  // Register a notification handler (e.g., for showing toast notifications)
  addNotificationHandler(handler: NotificationHandler): () => void {
    this.handlers.add(handler);
    try {
      // Debug: log when handlers are registered

      console.debug("notificationService: handler added, totalHandlers=", this.handlers.size);
    } catch {}
    return () => {
      this.handlers.delete(handler);
      try {
        // Debug: log when handlers are removed

        console.debug("notificationService: handler removed, totalHandlers=", this.handlers.size);
      } catch {}
    };
  }

  // Set the current chat ID to prevent notifications for the active chat
  setCurrentChatId(chatId: string | null): void {
    this.currentChatId = chatId;
  }

  // Handle incoming message and decide whether to show notification
  handleMessage(message: ChatMessage): void {
    const now = Date.now();
    for (const [id, at] of this.seenMessages) if (now - at > 120000) this.seenMessages.delete(id);
    if (this.seenMessages.has(message.messageId)) return;
    this.seenMessages.set(message.messageId, now);

    try {
      // Debug: log incoming message and number of handlers

      console.debug("notificationService.handleMessage called", {
        chatId: message.chatId,
        messageId: message.messageId,
        senderId: message.senderId,
        handlers: this.handlers.size,
      });
    } catch {}
    // Don't show notification if user is currently in the chat where the message was sent
    if (this.currentChatId === message.chatId) {
      try {
        console.debug(
          "notificationService: suppressed notification for current chat",
          this.currentChatId
        );
      } catch {}
      return;
    }

    // Don't show notification for own messages
    const currentUser =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("currentUser") || "null")
        : null;
    if (currentUser && message.senderId === currentUser.id) {
      return;
    }

    // Trigger all registered notification handlers
    this.handlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error("Error in notification handler:", error);
      }
    });
  }

  // Request notification permission (for browser notifications)
  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  // Show browser notification
  showBrowserNotification(message: ChatMessage, senderName?: string): void {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const notification = new Notification(`New message from ${senderName || "Unknown"}`, {
      body: message.content,
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: `chat-${message.chatId}`, // Prevents duplicate notifications for same chat
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Optional: Handle click to navigate to chat
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent("spotibuds:navigate", { detail: `/chat/${message.chatId}` })
      );
      notification.close();
    };
  }
}

// Create singleton instance
export const notificationService = new NotificationService();

// Export types for TypeScript
export type { NotificationHandler };

import { HubConnection } from "@microsoft/signalr";
import { ManagedHub } from "./managedHub";
import { notificationService } from "./notificationService";
// Types for friend and chat functionality
export interface FriendRequest {
  requestId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
}

export interface Friend {
  id: string;
  username: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface ChatMessage {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  createdAt: string;
  lastMessageAt?: string;
  lastMessage?: string;
  unreadCount: number;
}

class FriendHubManager {
  private connection: HubConnection | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private currentUserId: string | null = null;

  // Event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestReceived: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestAccepted: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestDeclined: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestSent: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendAdded: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRemoved: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendStatusChanged: ((data: any) => void) | null = null;

  private onMessageReceived: ((message: ChatMessage) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onMessageSent: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onMessageRead: ((data: any) => void) | null = null;
  private onChatCreated: ((chat: Chat) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onConnectionStateChanged: ((state: string) => void) | null = null;
  private onOnlineFriendsReceived: ((onlineFriends: string[]) => void) | null = null;

  private hub = new ManagedHub(
    "friend-hub",
    connection => {
      this.connection = connection;
      this.setupEventHandlers();
    },
    () => undefined,
    state => this.onConnectionStateChanged?.(state)
  );
  async connect(userId: string): Promise<void> {
    if (this.currentUserId && this.currentUserId !== userId) await this.disconnect();
    this.currentUserId = userId;
    await this.hub.start();
    this.connection = this.hub.connection;
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Friend request events
    this.connection.on("FriendRequestReceived", (request: FriendRequest) => {
      if (this.onFriendRequestReceived) {
        this.onFriendRequestReceived(request);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("FriendRequestAccepted", (data: any) => {
      if (this.onFriendRequestAccepted) {
        this.onFriendRequestAccepted(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("FriendRequestDeclined", (data: any) => {
      if (this.onFriendRequestDeclined) {
        this.onFriendRequestDeclined(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("FriendRequestSent", (data: any) => {
      if (this.onFriendRequestSent) {
        this.onFriendRequestSent(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("FriendAdded", (data: any) => {
      if (this.onFriendAdded) {
        this.onFriendAdded(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("FriendRemoved", (data: any) => {
      if (this.onFriendRemoved) {
        this.onFriendRemoved(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("FriendStatusChanged", (data: any) => {
      if (this.onFriendStatusChanged) {
        this.onFriendStatusChanged(data);
      }
    });

    // Online friends event
    this.connection.on("OnlineFriends", (onlineFriends: string[]) => {
      if (this.onOnlineFriendsReceived) {
        this.onOnlineFriendsReceived(onlineFriends);
      }
    });

    // Chat events
    this.connection.on("MessageReceived", (message: ChatMessage) => {
      // Handle notifications through the notification service
      notificationService.handleMessage(message);

      if (this.onMessageReceived) {
        this.onMessageReceived(message);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("MessageSent", (data: any) => {
      if (this.onMessageSent) {
        this.onMessageSent(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on("MessageRead", (data: any) => {
      if (this.onMessageRead) {
        this.onMessageRead(data);
      }
    });

    this.connection.on("ChatCreated", (chat: Chat) => {
      if (this.onChatCreated) {
        this.onChatCreated(chat);
      }
    });

    // Connection events
    this.connection.onclose(error => {
      this.onConnectionStateChanged?.("Disconnected");
      if (error) {
        console.error("Friend Hub connection closed with error:", error);
        this.onError?.("Connection lost. Attempting to reconnect...");
      }
    });
  }

  // Friend Management Methods
  async sendFriendRequest(targetUserId: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("SendFriendRequest", targetUserId);
    } catch (error) {
      console.error("Error sending friend request:", error);
      throw error;
    }
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("AcceptFriendRequest", requestId);
    } catch (error) {
      console.error("Error accepting friend request:", error);
      throw error;
    }
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("DeclineFriendRequest", requestId);
    } catch (error) {
      console.error("Error declining friend request:", error);
      throw error;
    }
  }

  async removeFriend(friendId: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("RemoveFriend", friendId);
    } catch (error) {
      console.error("Error removing friend:", error);
      throw error;
    }
  }

  // Chat Methods
  async sendMessage(chatId: string, message: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("SendMessage", chatId, message);
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("MarkMessageAsRead", messageId);
    } catch (error) {
      console.error("Error marking message as read:", error);
      throw error;
    }
  }

  async createChat(friendId: string): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("CreateChat", friendId);
    } catch (error) {
      console.error("Error creating chat:", error);
      throw error;
    }
  }

  async getOnlineFriends(): Promise<void> {
    if (!this.connection || this.connection.state !== "Connected") {
      throw new Error("Not connected to Friend Hub");
    }

    try {
      await this.connection.invoke("GetOnlineFriends"); // Changed from invoke to send
    } catch (error) {
      console.error("Error getting online friends:", error);
      throw error;
    }
  }

  // Connection Management
  async disconnect(): Promise<void> {
    this.currentUserId = null;
    this.connection = null;
    await this.hub.stop();
  }

  // Event Handler Setters
  setOnFriendRequestReceived(handler: ((request: FriendRequest) => void) | null): void {
    this.onFriendRequestReceived = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRequestAccepted(handler: ((data: any) => void) | null): void {
    this.onFriendRequestAccepted = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRequestDeclined(handler: ((data: any) => void) | null): void {
    this.onFriendRequestDeclined = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRequestSent(handler: ((data: any) => void) | null): void {
    this.onFriendRequestSent = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendAdded(handler: ((data: any) => void) | null): void {
    this.onFriendAdded = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRemoved(handler: ((data: any) => void) | null): void {
    this.onFriendRemoved = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendStatusChanged(handler: ((data: any) => void) | null): void {
    this.onFriendStatusChanged = handler;
  }

  setOnMessageReceived(handler: ((message: ChatMessage) => void) | null): void {
    this.onMessageReceived = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnMessageSent(handler: ((data: any) => void) | null): void {
    this.onMessageSent = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnMessageRead(handler: ((data: any) => void) | null): void {
    this.onMessageRead = handler;
  }

  setOnChatCreated(handler: ((chat: Chat) => void) | null): void {
    this.onChatCreated = handler;
  }

  setOnError(handler: ((error: string) => void) | null): void {
    this.onError = handler;
  }

  setOnConnectionStateChanged(handler: ((state: string) => void) | null): void {
    this.onConnectionStateChanged = handler;
  }

  setOnOnlineFriendsReceived(handler: ((onlineFriends: string[]) => void) | null): void {
    this.onOnlineFriendsReceived = handler;
  }

  // Utility Methods
  getConnectionState(): string {
    return this.connection?.state || "Disconnected";
  }

  isConnected(): boolean {
    return this.connection?.state === "Connected";
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

// Create singleton instance
export const friendHubManager = new FriendHubManager();

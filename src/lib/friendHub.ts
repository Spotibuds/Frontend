import { ManagedHub } from "./managedHub";
import { notificationService } from "./notificationService";
import { eventBus } from "./eventBus";
import type { ReadReceipt } from "./chatHub";
import { mapChatMessage, type ChatMessage } from "./chatState";
export type { ChatMessage } from "./chatState";
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
export interface Chat {
  id: string;
  participants: string[];
  createdAt: string;
  lastMessageAt?: string;
  lastMessage?: string;
  unreadCount: number;
}
export interface FriendChange {
  requestId: string;
  friendId: string;
  friendName?: string;
  friendAvatar?: string;
}
export interface FriendSent {
  requestId: string;
  targetUserId: string;
  timestamp: string;
}
export interface FriendHubHandlers {
  onFriendRequestReceived?: (request: FriendRequest) => void;
  onFriendRequestAccepted?: (change: FriendChange) => void;
  onFriendRequestDeclined?: (change: FriendChange) => void;
  onFriendRequestCancelled?: (change: FriendChange) => void;
  onFriendRequestSent?: (request: FriendSent) => void;
  onFriendAdded?: (change: FriendChange) => void;
  onFriendRemoved?: (change: FriendChange) => void;
  onFriendStatusChanged?: (status: { friendId: string; isOnline: boolean }) => void;
  onOnlineFriendsReceived?: (ids: string[]) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onMessageRead?: (receipt: { messageId: string; chatId?: string; userId: string }) => void;
  onAllMessagesRead?: (receipt: ReadReceipt) => void;
  onChatCreated?: (chat: Chat) => void;
  onError?: (error: string) => void;
  onConnectionStateChanged?: (state: string) => void;
}
function change(value: Record<string, unknown>): FriendChange {
  return {
    requestId: String(value.requestId || value.friendshipId || ""),
    friendId: String(value.friendId || value.removedFriendId || ""),
    friendName: typeof value.friendName === "string" ? value.friendName : undefined,
    friendAvatar: typeof value.friendAvatar === "string" ? value.friendAvatar : undefined,
  };
}
export class FriendHubManager {
  private subscribers = new Set<FriendHubHandlers>();
  private currentUserId: string | null = null;
  private onlineFriends: string[] = [];
  private hub = new ManagedHub(
    "friend-hub",
    connection => {
      connection.on("FriendRequestReceived", (value: Record<string, unknown>) => {
        const request = {
          requestId: String(value.requestId || ""),
          senderId: String(value.requesterId || value.senderId || ""),
          senderName: String(value.requesterUsername || value.senderName || "Unknown User"),
          senderAvatar:
            typeof value.requesterAvatar === "string" ? value.requesterAvatar : undefined,
          timestamp: String(value.requestedAt || value.timestamp || ""),
        };
        if (request.requestId && request.senderId) {
          this.changedFriendship(request.senderId);
          this.emit("onFriendRequestReceived", request);
        }
      });
      const transitions = {
        FriendRequestAccepted: "onFriendRequestAccepted",
        FriendRequestDeclined: "onFriendRequestDeclined",
        FriendRequestCancelled: "onFriendRequestCancelled",
        FriendAdded: "onFriendAdded",
        FriendRemoved: "onFriendRemoved",
      } as const;
      for (const [event, handler] of Object.entries(transitions))
        connection.on(event, (value: Record<string, unknown>) => {
          const changed = change(value);
          this.changedFriendship(changed.friendId);
          this.emit(handler, changed);
        });
      connection.on("FriendRequestSent", (value: Record<string, unknown>) => {
        const request = {
          requestId: String(value.requestId || value.friendshipId || ""),
          targetUserId: String(value.targetUserId || value.addresseeId || ""),
          timestamp: String(value.requestedAt || value.timestamp || ""),
        };
        this.changedFriendship(request.targetUserId);
        this.emit("onFriendRequestSent", request);
      });
      connection.on("FriendStatusChanged", value => this.emit("onFriendStatusChanged", value));
      connection.on("OnlineFriends", (ids: string[]) => {
        this.onlineFriends = ids;
        this.emit("onOnlineFriendsReceived", ids);
      });
      // ChatCommands publishes NewMessage on this hub, using the same DTO as ChatHub.
      connection.on("NewMessage", (value: Record<string, unknown>) => {
        const message = mapChatMessage(value);
        if (!message.messageId) return;
        notificationService.handleMessage(message);
        this.emit("onMessageReceived", message);
      });
      connection.on("MessageSent", (value: Record<string, unknown>) =>
        this.emit("onMessageSent", mapChatMessage(value))
      );
      connection.on("MessageRead", value => this.emit("onMessageRead", value));
      connection.on("AllMessagesRead", value => this.emit("onAllMessagesRead", value));
      connection.on("ChatCreated", value =>
        this.emit("onChatCreated", { ...value, id: value.chatId || value.id, unreadCount: 0 })
      );
      connection.on("Error", error => this.emit("onError", String(error)));
    },
    async () => {
      await this.hub.invoke("GetOnlineFriends");
    },
    state => this.emit("onConnectionStateChanged", state)
  );
  private changedFriendship(friendId: string) {
    if (this.currentUserId && friendId)
      eventBus.emit("friendshipStatusChanged", this.currentUserId, friendId);
  }
  private emit<K extends keyof FriendHubHandlers>(
    key: K,
    value: Parameters<NonNullable<FriendHubHandlers[K]>>[0]
  ) {
    for (const handlers of this.subscribers) {
      const handler = handlers[key] as ((argument: typeof value) => void) | undefined;
      handler?.(value);
    }
  }
  subscribe(handlers: FriendHubHandlers) {
    this.subscribers.add(handlers);
    handlers.onConnectionStateChanged?.(this.hub.state());
    handlers.onOnlineFriendsReceived?.(this.onlineFriends);
    return () => {
      this.subscribers.delete(handlers);
    };
  }
  async connect(userId: string) {
    if (this.currentUserId && this.currentUserId !== userId) await this.disconnect();
    this.currentUserId = userId;
    await this.hub.start();
  }
  async disconnect() {
    this.currentUserId = null;
    this.onlineFriends = [];
    await this.hub.stop();
  }
  sendFriendRequest(targetUserId: string) {
    return this.hub.invoke("SendFriendRequest", targetUserId);
  }
  acceptFriendRequest(requestId: string) {
    return this.hub.invoke("AcceptFriendRequest", requestId);
  }
  declineFriendRequest(requestId: string) {
    return this.hub.invoke("DeclineFriendRequest", requestId);
  }
  removeFriend(friendId: string) {
    return this.hub.invoke("RemoveFriend", friendId);
  }
  async sendMessage(chatId: string, content: string) {
    const value = await this.hub.invoke<Record<string, unknown>>(
      "SendMessage",
      chatId,
      content,
      crypto.randomUUID()
    );
    const message = mapChatMessage(value);
    this.emit("onMessageSent", message);
    return message;
  }
  markMessageAsRead(messageId: string) {
    return this.hub.invoke("MarkMessageAsRead", messageId);
  }
  createChat(friendId: string) {
    return this.hub.invoke("CreateChat", friendId);
  }
  getOnlineFriends() {
    return this.hub.invoke("GetOnlineFriends");
  }
  getConnectionState() {
    return this.hub.state();
  }
  isConnected() {
    return this.hub.state() === "Connected";
  }
  getCurrentUserId() {
    return this.currentUserId;
  }
}
export const friendHubManager = new FriendHubManager();

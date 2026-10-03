import { HubConnectionState } from "@microsoft/signalr";
import { ManagedHub } from "./managedHub";
import { notificationService } from "./notificationService";
import { getSessionUser } from "./session";
// Chat message interface
export interface ChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

// Chat hub handlers interface
export interface ChatHubHandlers {
  onMessageReceived?: (message: ChatMessage) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onMessageRead?: (messageId: string) => void;
  onUserStartedTyping?: (userId: string) => void;
  onUserStoppedTyping?: (userId: string) => void;
  onChatJoined?: (chatId: string) => void;
  onChatLeft?: (chatId: string) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: HubConnectionState) => void;
}

function mapMessage(value: Record<string, unknown>): ChatMessage {
  return {
    messageId: String(value.id || value.messageId || ""),
    chatId: String(value.chatId || ""),
    senderId: String(value.senderId || ""),
    senderName: String(value.senderUsername || value.senderName || "Unknown User"),
    content: String(value.content || ""),
    timestamp: String(value.createdAt || value.sentAt || value.timestamp || ""),
    isRead: Boolean(value.isRead),
  };
}
export class ChatHubService {
  private handlers: ChatHubHandlers = {};
  private desiredChatId: string | null = null;
  private joinedChatId: string | null = null;
  private hub = new ManagedHub(
    "chat-hub",
    connection => {
      connection.on("ReceiveMessage", (value: Record<string, unknown>) => {
        const message = mapMessage(value);
        this.handlers.onMessageReceived?.(message);
        notificationService.handleMessage(message);
      });
      connection.on("MessageSent", (value: Record<string, unknown>) =>
        this.handlers.onMessageSent?.(mapMessage(value))
      );
      connection.on("MessageRead", (receipt: { messageId: string; userId: string }) => {
        if (receipt.userId !== getSessionUser()?.id && receipt.messageId)
          this.handlers.onMessageRead?.(receipt.messageId);
      });
      connection.on("UserTyping", (event: { userId: string; isTyping: boolean }) => {
        if (event.userId === getSessionUser()?.id) return;
        if (event.isTyping) this.handlers.onUserStartedTyping?.(event.userId);
        else this.handlers.onUserStoppedTyping?.(event.userId);
      });
      connection.on("Error", (error: string) => this.handlers.onError?.(error));
    },
    async () => {
      if (this.desiredChatId) await this.performJoin(this.desiredChatId);
    },
    state => {
      if (state !== HubConnectionState.Connected) this.joinedChatId = null;
      this.handlers.onConnectionStateChange?.(state);
    }
  );
  enableConnection() {
    return this.hub.start();
  }
  async disableConnection() {
    this.desiredChatId = null;
    this.joinedChatId = null;
    await this.hub.stop();
  }
  setHandlers(handlers: ChatHubHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
    handlers.onConnectionStateChange?.(this.hub.state());
    if (this.joinedChatId) handlers.onChatJoined?.(this.joinedChatId);
  }
  removeHandlers() {
    this.handlers = {};
  }
  private async performJoin(chatId: string) {
    await this.hub.invoke("JoinChat", chatId);
    if (this.desiredChatId === chatId) {
      this.joinedChatId = chatId;
      this.handlers.onChatJoined?.(chatId);
    }
  }
  async joinChat(chatId: string) {
    this.desiredChatId = chatId;
    await this.hub.start();
    if (this.joinedChatId !== chatId) await this.performJoin(chatId);
  }
  async leaveChat(chatId: string) {
    if (this.desiredChatId !== chatId) return;
    this.desiredChatId = null;
    this.joinedChatId = null;
    if (this.hub.state() === HubConnectionState.Connected)
      await this.hub.invoke("LeaveChat", chatId);
    this.handlers.onChatLeft?.(chatId);
  }
  async sendMessage(
    chatId: string,
    content: string,
    clientMessageId = crypto.randomUUID()
  ): Promise<ChatMessage> {
    if (this.joinedChatId !== chatId)
      throw new Error("Chat is reconnecting. Your draft has been kept; retry when connected.");
    const value = await this.hub.invoke<Record<string, unknown>>(
      "SendMessage",
      chatId,
      content,
      clientMessageId
    );
    if (!value)
      throw new Error("The server did not acknowledge the message. Keep your draft and retry.");
    const message = mapMessage(value);
    if (!message.messageId)
      throw new Error("The server returned an invalid message acknowledgement.");
    this.handlers.onMessageSent?.(message);
    return message;
  }
  startTyping(chatId: string) {
    return this.hub.invoke("StartTyping", chatId);
  }
  stopTyping(chatId: string) {
    return this.hub.invoke("StopTyping", chatId);
  }
  markMessageAsRead(id: string) {
    return this.hub.invoke("MarkMessageAsRead", id);
  }
  getConnectionState() {
    return this.hub.state();
  }
  getCurrentChatId() {
    return this.joinedChatId;
  }
  disconnect() {
    return this.disableConnection();
  }
  destroy() {
    this.handlers = {};
    return this.disableConnection();
  }
}
export const chatHub = new ChatHubService();

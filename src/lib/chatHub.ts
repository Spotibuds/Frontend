import { HubConnectionState } from "@microsoft/signalr";
import { ManagedHub } from "./managedHub";
import { notificationService } from "./notificationService";
import { getSessionUser } from "./session";
import { mapChatMessage, type ChatMessage } from "./chatState";
export type { ChatMessage } from "./chatState";
export interface ReadReceipt {
  chatId: string;
  userId: string;
  readAt: string;
  throughMessageId?: string;
  throughSentAt?: string;
}
export interface ChatHubHandlers {
  onMessageReceived?: (message: ChatMessage) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onMessageRead?: (
    messageId: string,
    receipt?: { chatId?: string; userId: string; readAt?: string }
  ) => void;
  onAllMessagesRead?: (receipt: ReadReceipt) => void;
  onUserStartedTyping?: (userId: string) => void;
  onUserStoppedTyping?: (userId: string) => void;
  onChatJoined?: (chatId: string) => void;
  onChatLeft?: (chatId: string) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: HubConnectionState) => void;
}
export class ChatHubService {
  private subscribers = new Map<string, ChatHubHandlers>();
  private desiredChatId: string | null = null;
  private joinedChatId: string | null = null;
  private roomVersion = 0;
  private joinOperation: { chatId: string; version: number; promise: Promise<void> } | null = null;
  private hub = new ManagedHub(
    "chat-hub",
    connection => {
      connection.on("ReceiveMessage", (value: Record<string, unknown>) => {
        const message = mapChatMessage(value);
        if (!message.messageId) return;
        this.emit(handlers => handlers.onMessageReceived?.(message));
        notificationService.handleMessage(message);
      });
      connection.on("MessageSent", (value: Record<string, unknown>) =>
        this.emit(handlers => handlers.onMessageSent?.(mapChatMessage(value)))
      );
      connection.on(
        "MessageRead",
        (receipt: { messageId: string; chatId?: string; userId: string; readAt?: string }) => {
          if (receipt.userId !== getSessionUser()?.id && receipt.messageId)
            this.emit(handlers => handlers.onMessageRead?.(receipt.messageId, receipt));
        }
      );
      connection.on("AllMessagesRead", (receipt: ReadReceipt) => {
        if (receipt.userId !== getSessionUser()?.id)
          this.emit(handlers => handlers.onAllMessagesRead?.(receipt));
      });
      connection.on(
        "UserTyping",
        (event: { chatId: string; userId: string; isTyping: boolean }) => {
          if (event.userId === getSessionUser()?.id || event.chatId !== this.joinedChatId) return;
          this.emit(handlers =>
            event.isTyping
              ? handlers.onUserStartedTyping?.(event.userId)
              : handlers.onUserStoppedTyping?.(event.userId)
          );
        }
      );
      connection.on("Error", (error: string) => this.emit(handlers => handlers.onError?.(error)));
    },
    async () => {
      if (this.desiredChatId) await this.performJoin(this.desiredChatId);
    },
    state => {
      if (state !== HubConnectionState.Connected) this.joinedChatId = null;
      this.emit(handlers => handlers.onConnectionStateChange?.(state));
    }
  );
  private emit(deliver: (handlers: ChatHubHandlers) => void) {
    for (const handlers of this.subscribers.values()) deliver(handlers);
  }
  enableConnection() {
    return this.hub.start();
  }
  async disableConnection() {
    this.desiredChatId = null;
    this.joinedChatId = null;
    this.roomVersion++;
    await this.hub.stop();
  }
  setHandlers(handlers: ChatHubHandlers, subscriber = "default") {
    this.subscribers.set(subscriber, handlers);
    handlers.onConnectionStateChange?.(this.hub.state());
    if (this.joinedChatId) handlers.onChatJoined?.(this.joinedChatId);
  }
  removeHandlers(subscriber = "default") {
    this.subscribers.delete(subscriber);
  }
  private performJoin(chatId: string): Promise<void> {
    const version = this.roomVersion;
    if (this.joinOperation?.chatId === chatId && this.joinOperation.version === version)
      return this.joinOperation.promise;
    const promise = (async () => {
      await this.hub.invoke("JoinChat", chatId);
      if (this.desiredChatId === chatId && this.roomVersion === version) {
        this.joinedChatId = chatId;
        this.emit(handlers => handlers.onChatJoined?.(chatId));
      } else if (
        this.desiredChatId !== chatId &&
        this.hub.state() === HubConnectionState.Connected
      ) {
        await this.hub.invoke("LeaveChat", chatId);
      }
    })();
    const operation = { chatId, version, promise };
    this.joinOperation = operation;
    return promise.finally(() => {
      if (this.joinOperation === operation) this.joinOperation = null;
    });
  }
  async joinChat(chatId: string) {
    if (this.desiredChatId !== chatId) {
      const previous = this.joinedChatId;
      this.roomVersion++;
      this.desiredChatId = chatId;
      this.joinedChatId = null;
      if (previous && this.hub.state() === HubConnectionState.Connected)
        await this.hub.invoke("LeaveChat", previous);
    }
    await this.hub.start();
    if (this.desiredChatId !== chatId)
      throw new Error("Connection unavailable. The conversation is no longer active.");
    if (this.desiredChatId === chatId && this.joinedChatId !== chatId)
      await this.performJoin(chatId);
  }
  async leaveChat(chatId: string) {
    if (this.desiredChatId !== chatId) return;
    this.roomVersion++;
    this.desiredChatId = null;
    this.joinedChatId = null;
    if (this.hub.state() === HubConnectionState.Connected)
      await this.hub.invoke("LeaveChat", chatId);
    this.emit(handlers => handlers.onChatLeft?.(chatId));
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
    const message = mapChatMessage(value);
    if (!message.messageId || message.chatId !== chatId)
      throw new Error(
        "The server returned an invalid message acknowledgement. Your draft was kept."
      );
    this.emit(handlers => handlers.onMessageSent?.(message));
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
  markAllMessagesAsRead(chatId: string) {
    return this.hub.invoke("MarkAllMessagesAsRead", chatId);
  }
  markMessagesReadThrough(chatId: string, messageId: string) {
    return this.hub.invoke("MarkMessagesReadThrough", chatId, messageId);
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
    this.subscribers.clear();
    return this.disableConnection();
  }
}
export const chatHub = new ChatHubService();

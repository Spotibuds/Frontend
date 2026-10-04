import { useEffect, useState, useCallback, useRef } from "react";
import {
  friendHubManager,
  type FriendRequest,
  type Friend,
  type ChatMessage,
  type Chat,
  type FriendChange,
  type FriendSent,
} from "../lib/friendHub";
import { mergeChatMessages } from "../lib/chatState";
import { useDeferredEffect } from "./useDeferredEffect";
interface UseFriendHubOptions {
  userId?: string;
  autoConnect?: boolean;
  onError?: (error: string) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onMessageRead?: (messageId: string) => void;
}
interface FriendHubState {
  isConnected: boolean;
  connectionState: string;
  friends: Friend[];
  friendRequests: FriendRequest[];
  chats: Chat[];
  messages: Record<string, ChatMessage[]>;
  onlineFriends: string[];
  error: string | null;
  lastFriendRequestReceived?: FriendRequest;
  lastFriendRequestAccepted?: FriendChange;
  lastFriendRequestDeclined?: FriendChange;
  lastFriendRequestCancelled?: FriendChange;
  lastFriendRequestSent?: FriendSent;
  lastFriendAdded?: FriendChange;
  lastFriendRemoved?: FriendChange;
}
const initialState: FriendHubState = {
  isConnected: false,
  connectionState: "Disconnected",
  friends: [],
  friendRequests: [],
  chats: [],
  messages: {},
  onlineFriends: [],
  error: null,
};
export const useFriendHub = (options: UseFriendHubOptions = {}) => {
  const { userId, autoConnect = true } = options;
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });
  const [state, setState] = useState<FriendHubState>(initialState);
  const perform = useCallback(async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      setState(previous => ({ ...previous, error: null }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection unavailable. Please retry.";
      setState(previous => ({ ...previous, error: message }));
      callbacks.current.onError?.(message);
      throw error;
    }
  }, []);
  const connect = useCallback(async () => {
    if (!userId) return;
    await perform(() => friendHubManager.connect(userId));
  }, [userId, perform]);
  useDeferredEffect(() => {
    setState(initialState);
    if (!userId) return;
    const transition = (
      key:
        | "lastFriendRequestAccepted"
        | "lastFriendRequestDeclined"
        | "lastFriendRequestCancelled"
        | "lastFriendAdded"
        | "lastFriendRemoved",
      change: FriendChange
    ) => {
      setState(previous => ({
        ...previous,
        [key]: change,
        friendRequests: previous.friendRequests.filter(
          request => request.requestId !== change.requestId
        ),
        friends:
          key === "lastFriendRemoved"
            ? previous.friends.filter(friend => friend.id !== change.friendId)
            : (key === "lastFriendRequestAccepted" || key === "lastFriendAdded") && change.friendId
              ? [
                  ...previous.friends.filter(friend => friend.id !== change.friendId),
                  {
                    id: change.friendId,
                    username: change.friendName || "Unknown User",
                    avatarUrl: change.friendAvatar,
                    isOnline: previous.onlineFriends.includes(change.friendId),
                  },
                ]
              : previous.friends,
      }));
    };
    const receive = (message: ChatMessage, sent: boolean) => {
      setState(previous => ({
        ...previous,
        messages: {
          ...previous.messages,
          [message.chatId]: mergeChatMessages(previous.messages[message.chatId] || [], [message]),
        },
        chats: previous.chats.map(chat => {
          if (chat.id !== message.chatId) return chat;
          const duplicate = previous.messages[message.chatId]?.some(
            saved => saved.messageId === message.messageId
          );
          const newer =
            !chat.lastMessageAt || Date.parse(message.timestamp) >= Date.parse(chat.lastMessageAt);
          return {
            ...chat,
            ...(newer ? { lastMessage: message.content, lastMessageAt: message.timestamp } : {}),
            unreadCount:
              !sent && message.senderId !== userId && !duplicate
                ? chat.unreadCount + 1
                : chat.unreadCount,
          };
        }),
      }));
      if (sent) callbacks.current.onMessageSent?.(message);
      else callbacks.current.onMessageReceived?.(message);
    };
    const unsubscribe = friendHubManager.subscribe({
      onConnectionStateChanged: connectionState =>
        setState(previous => ({
          ...previous,
          connectionState,
          isConnected: connectionState === "Connected",
        })),
      onOnlineFriendsReceived: onlineFriends =>
        setState(previous => ({ ...previous, onlineFriends })),
      onFriendRequestReceived: request => {
        setState(previous => ({
          ...previous,
          friendRequests: [
            ...previous.friendRequests.filter(saved => saved.requestId !== request.requestId),
            request,
          ],
          lastFriendRequestReceived: request,
        }));
      },
      onFriendRequestAccepted: change => transition("lastFriendRequestAccepted", change),
      onFriendRequestDeclined: change => transition("lastFriendRequestDeclined", change),
      onFriendRequestCancelled: change => transition("lastFriendRequestCancelled", change),
      onFriendAdded: change => transition("lastFriendAdded", change),
      onFriendRemoved: change => transition("lastFriendRemoved", change),
      onFriendRequestSent: request => {
        setState(previous => ({ ...previous, lastFriendRequestSent: request }));
      },
      onFriendStatusChanged: status =>
        setState(previous => ({
          ...previous,
          onlineFriends: status.isOnline
            ? [...new Set([...previous.onlineFriends, status.friendId])]
            : previous.onlineFriends.filter(id => id !== status.friendId),
          friends: previous.friends.map(friend =>
            friend.id === status.friendId ? { ...friend, isOnline: status.isOnline } : friend
          ),
        })),
      onMessageReceived: message => receive(message, false),
      onMessageSent: message => receive(message, true),
      onMessageRead: receipt => {
        if (receipt.userId === userId) return;
        setState(previous => ({
          ...previous,
          messages: Object.fromEntries(
            Object.entries(previous.messages).map(([id, messages]) => [
              id,
              messages.map(message =>
                message.messageId === receipt.messageId ? { ...message, isRead: true } : message
              ),
            ])
          ),
        }));
        callbacks.current.onMessageRead?.(receipt.messageId);
      },
      onAllMessagesRead: receipt => {
        if (receipt.userId === userId || !receipt.throughMessageId || !receipt.throughSentAt)
          return;
        setState(previous => ({
          ...previous,
          messages: {
            ...previous.messages,
            [receipt.chatId]: (previous.messages[receipt.chatId] || []).map(message => {
              const before =
                Date.parse(message.timestamp) < Date.parse(receipt.throughSentAt!) ||
                (Date.parse(message.timestamp) === Date.parse(receipt.throughSentAt!) &&
                  message.messageId <= receipt.throughMessageId!);
              return message.senderId === userId && before ? { ...message, isRead: true } : message;
            }),
          },
        }));
      },
      onChatCreated: chat =>
        setState(previous => ({
          ...previous,
          chats: [...previous.chats.filter(saved => saved.id !== chat.id), chat],
        })),
      onError: error => {
        setState(previous => ({ ...previous, error }));
        callbacks.current.onError?.(error);
      },
    });
    if (autoConnect)
      void friendHubManager.connect(userId).catch(error => {
        const message =
          error instanceof Error
            ? error.message
            : "Friend updates could not connect. Please retry.";
        setState(previous => ({ ...previous, error: message }));
        callbacks.current.onError?.(message);
      });
    // Subscription cleanup must not stop the shared session-owned connection.
    return unsubscribe;
  }, [userId, autoConnect]);
  return {
    ...state,
    connect,
    disconnect: () => friendHubManager.disconnect(),
    sendFriendRequest: (id: string) => perform(() => friendHubManager.sendFriendRequest(id)),
    acceptFriendRequest: (id: string) => perform(() => friendHubManager.acceptFriendRequest(id)),
    declineFriendRequest: (id: string) => perform(() => friendHubManager.declineFriendRequest(id)),
    removeFriend: (id: string) => perform(() => friendHubManager.removeFriend(id)),
    sendMessage: (chatId: string, content: string) =>
      perform(() => friendHubManager.sendMessage(chatId, content)),
    markMessageAsRead: (id: string) => perform(() => friendHubManager.markMessageAsRead(id)),
    createChat: (id: string) => perform(() => friendHubManager.createChat(id)),
    getOnlineFriends: () => perform(() => friendHubManager.getOnlineFriends()),
    getChatMessages: (id: string) => state.messages[id] || [],
    getChat: (id: string) => state.chats.find(chat => chat.id === id),
    getFriend: (id: string) => state.friends.find(friend => friend.id === id),
    clearError: useCallback(() => setState(previous => ({ ...previous, error: null })), []),
    clearLastEvents: useCallback(
      () =>
        setState(previous => ({
          ...previous,
          lastFriendRequestReceived: undefined,
          lastFriendRequestAccepted: undefined,
          lastFriendRequestDeclined: undefined,
          lastFriendRequestCancelled: undefined,
          lastFriendRequestSent: undefined,
          lastFriendAdded: undefined,
          lastFriendRemoved: undefined,
        })),
      []
    ),
  };
};

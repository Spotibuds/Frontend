import { useCallback, useEffect, useRef, useState } from "react";
import { userApi, identityApi, type Chat, type User } from "@/lib/api";
import { chatHub, type ReadReceipt } from "@/lib/chatHub";
import {
  getDraftAttempt,
  compareChatPositions,
  mapChatMessage,
  mergeChatMessages,
  type ChatMessage,
  type DraftAttempt,
} from "@/lib/chatState";
import { useDeferredEffect } from "./useDeferredEffect";

export function useChatConversation(chatId: string) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<User | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [readError, setReadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyNeedsReload, setHistoryNeedsReload] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [connectionState, setConnectionState] = useState(chatHub.getConnectionState());
  const [joined, setJoined] = useState(false);
  const [revision, setRevision] = useState(0);
  const [readRevision, setReadRevision] = useState(0);
  const scope = useRef({ chatId, version: 0 });
  const oldest = useRef<string | undefined>(undefined);
  const draftAttempts = useRef(new Map<string, DraftAttempt>());
  const drafts = useRef(new Map<string, string>());
  const messageRef = useRef(message);
  const sendingRef = useRef(false);
  const olderRef = useRef(false);
  const readPending = useRef(false);
  const readFailed = useRef(false);
  const readIds = useRef(new Set<string>());
  const readBoundary = useRef<Pick<ChatMessage, "messageId" | "timestamp"> | null>(null);
  const pendingBoundaries = useRef(new Set<string>());
  const newest = useRef<Pick<ChatMessage, "messageId" | "timestamp"> | null>(null);
  const recoveryBoundary = useRef<Pick<ChatMessage, "messageId" | "timestamp"> | null | undefined>(
    undefined
  );
  const pendingLive = useRef(new Map<string, ChatMessage>());
  const recoveryEpoch = useRef(0);
  const isConnected = connectionState === "Connected" && joined;
  useEffect(() => {
    messageRef.current = message;
  }, [message]);
  useEffect(() => {
    let wasHidden = document.hidden;
    const changed = () => {
      const hidden = document.hidden;
      if (wasHidden && !hidden) {
        readFailed.current = false;
        setReadRevision(previous => previous + 1);
      }
      wasHidden = hidden;
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const merge = useCallback((messages: ChatMessage[]) => {
    setChatMessages(previous => {
      const merged = mergeChatMessages(previous, messages);
      for (const saved of merged) {
        if (pendingBoundaries.current.has(saved.messageId)) {
          if (!readBoundary.current || compareChatPositions(saved, readBoundary.current) > 0)
            readBoundary.current = saved;
          pendingBoundaries.current.delete(saved.messageId);
        }
      }
      newest.current = merged.at(-1) || null;
      return merged.map(saved => {
        const through = readBoundary.current;
        const before = through && compareChatPositions(saved, through) <= 0;
        return saved.senderId === identityApi.getCurrentUser()?.id &&
          (readIds.current.has(saved.messageId) || before)
          ? { ...saved, isRead: true }
          : saved;
      });
    });
  }, []);
  const applyLive = useCallback(
    (saved: ChatMessage) => {
      if (recoveryBoundary.current !== undefined) {
        const previous = pendingLive.current.get(saved.messageId);
        pendingLive.current.set(
          saved.messageId,
          mergeChatMessages(previous ? [previous] : [], [saved])[0]
        );
      } else merge([saved]);
    },
    [merge]
  );
  const refreshLatest = useCallback(
    async (version: number) => {
      const epoch = recoveryEpoch.current;
      const boundary =
        recoveryBoundary.current === undefined ? newest.current : recoveryBoundary.current;
      const messages = await userApi.getChatMessages(chatId);
      if (
        scope.current.chatId !== chatId ||
        scope.current.version !== version ||
        recoveryEpoch.current !== epoch
      )
        return;
      const mapped = messages.map(value =>
        mapChatMessage(value as unknown as Record<string, unknown>)
      );
      let page = mapped;
      let pages = 1;
      // Walk back to the last known message before exposing a newly recovered tail.
      // Keeping only the newest page would make a gap unreachable by the old history cursor.
      while (boundary && page.length === 50) {
        const first = mergeChatMessages([], page)[0];
        if (!first || compareChatPositions(first, boundary) <= 0) break;
        if (pages++ >= 20) {
          setHistoryNeedsReload(true);
          throw new Error("Too many missed messages to refresh at once. Reload this conversation.");
        }
        const older = await userApi.getChatMessages(chatId, 1, 50, first.messageId);
        if (
          scope.current.chatId !== chatId ||
          scope.current.version !== version ||
          recoveryEpoch.current !== epoch
        )
          return;
        page = older.map(value => mapChatMessage(value as unknown as Record<string, unknown>));
        mapped.push(...page);
      }
      merge([...mapped, ...pendingLive.current.values()]);
      pendingLive.current.clear();
      recoveryBoundary.current = undefined;
      setReadRevision(previous => previous + 1);
      if (!oldest.current) {
        oldest.current = mergeChatMessages([], mapped)[0]?.messageId;
        setHasOlder(messages.length === 50);
      }
    },
    [chatId, merge]
  );
  useDeferredEffect(() => {
    const owner = scope.current;
    const draftStore = drafts.current;
    const version = ++owner.version;
    owner.chatId = chatId;
    let active = true;
    setIsLoading(true);
    setLoadError("");
    setChat(null);
    setOtherParticipant(null);
    setCurrentUser(null);
    setChatMessages([]);
    setJoined(false);
    setMessage(drafts.current.get(chatId) || "");
    setSendError("");
    setReadError("");
    setHistoryError("");
    setHistoryNeedsReload(false);
    setLoadingOlder(false);
    setSending(false);
    oldest.current = undefined;
    olderRef.current = false;
    sendingRef.current = false;
    readFailed.current = false;
    readPending.current = false;
    readIds.current.clear();
    readBoundary.current = null;
    pendingBoundaries.current.clear();
    newest.current = null;
    recoveryBoundary.current = undefined;
    pendingLive.current.clear();
    recoveryEpoch.current++;
    void (async () => {
      try {
        const identity = identityApi.getCurrentUser();
        if (!identity) throw new Error("Sign in to open this conversation.");
        const profile = await userApi.getCurrentUserProfile();
        if (!active) return;
        setCurrentUser(profile || identity);
        const data = await userApi.getChat(chatId);
        if (!active) return;
        setChat(data);
        const otherId = data.participants.find(id => id !== identity.id);
        if (otherId) {
          const profiles = await userApi.getUserProfilesBatch([otherId]);
          if (!active) return;
          setOtherParticipant(profiles[0] || { id: otherId, username: "Deleted account" });
        }
        await refreshLatest(version);
      } catch (error) {
        if (active)
          setLoadError(
            error instanceof Error ? error.message : "Messages could not be loaded. Please retry."
          );
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
      draftStore.set(chatId, messageRef.current);
      owner.version++;
    };
  }, [chatId, revision, refreshLatest]);

  useEffect(() => {
    if (!currentUser?.id || !chat) return;
    const version = scope.current.version;
    let active = true;
    const receive = (saved: ChatMessage) => {
      if (active && saved.chatId === chatId) applyLive(saved);
    };
    chatHub.setHandlers(
      {
        onConnectionStateChange: state => {
          if (!active) return;
          setConnectionState(state);
          if (state !== "Connected") {
            // A second loss invalidates an earlier catch-up without advancing its safe boundary.
            recoveryEpoch.current++;
            if (recoveryBoundary.current === undefined) {
              recoveryBoundary.current = newest.current;
            }
            setJoined(false);
          }
        },
        onChatJoined: id => {
          if (!active || id !== chatId) return;
          setJoined(true);
          readFailed.current = false;
          setReadError("");
          // A personal hub can deliver while history is loading, and reconnect can miss events.
          void refreshLatest(version).catch(error => {
            if (active)
              setHistoryError(
                error instanceof Error
                  ? error.message
                  : "Latest messages could not be refreshed. Retry loading messages."
              );
          });
        },
        onMessageReceived: receive,
        onMessageSent: receive,
        onMessageRead: (id, receipt) => {
          if (
            !active ||
            receipt?.userId === currentUser.id ||
            (receipt?.chatId && receipt.chatId !== chatId)
          )
            return;
          readIds.current.add(id);
          merge([]);
        },
        onAllMessagesRead: (receipt: ReadReceipt) => {
          if (
            !active ||
            receipt.userId === currentUser.id ||
            receipt.chatId !== chatId ||
            !receipt.throughMessageId
          )
            return;
          if (receipt.throughSentAt) {
            const boundary = {
              messageId: receipt.throughMessageId,
              timestamp: receipt.throughSentAt,
            };
            if (!readBoundary.current || compareChatPositions(boundary, readBoundary.current) > 0)
              readBoundary.current = boundary;
          } else pendingBoundaries.current.add(receipt.throughMessageId);
          merge([]);
          void refreshLatest(version).catch(error => {
            if (active)
              setHistoryError(
                error instanceof Error
                  ? error.message
                  : "Read status could not be refreshed. Retry loading messages."
              );
          });
        },
        onError: error => {
          if (active) setSendError(error);
        },
      },
      "Conversation"
    );
    void chatHub.joinChat(chatId).catch(error => {
      if (active)
        setSendError(
          error instanceof Error
            ? error.message
            : "Conversation could not connect. Reconnect to send your draft."
        );
    });
    return () => {
      active = false;
      chatHub.removeHandlers("Conversation");
      void chatHub.leaveChat(chatId).catch(() => undefined);
    };
  }, [chatId, currentUser?.id, chat, merge, applyLive, refreshLatest]);

  useEffect(() => {
    if (
      !isConnected ||
      isLoading ||
      !currentUser ||
      readPending.current ||
      readFailed.current ||
      recoveryBoundary.current !== undefined ||
      document.hidden
    )
      return;
    const unread = chatMessages.filter(
      saved => saved.senderId !== currentUser.id && !saved.readBy?.includes(currentUser.id)
    );
    if (!unread.length) return;
    const version = scope.current.version;
    readPending.current = true;
    const through = chatMessages.at(-1)!;
    void chatHub
      .markMessagesReadThrough(chatId, through.messageId)
      .then(() => {
        if (version !== scope.current.version) return;
        const ids = new Set(unread.map(saved => saved.messageId));
        setChatMessages(previous =>
          previous.map(saved =>
            ids.has(saved.messageId)
              ? {
                  ...saved,
                  isRead: true,
                  readBy: [...new Set([...(saved.readBy || []), currentUser.id])],
                }
              : saved
          )
        );
        setReadError("");
      })
      .catch(() => {
        if (version === scope.current.version) {
          readFailed.current = true;
          setReadError("Read status could not be saved. Retry when connected.");
        }
      })
      .finally(() => {
        if (version === scope.current.version) {
          readPending.current = false;
          setReadRevision(previous => previous + 1);
        }
      });
  }, [chatMessages, isConnected, isLoading, currentUser, chatId, readRevision]);

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !currentUser || sendingRef.current) return;
    const draft = message;
    const version = scope.current.version;
    const attempt = getDraftAttempt(draftAttempts.current.get(chatId) || null, chatId, draft);
    draftAttempts.current.set(chatId, attempt);
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    try {
      const acknowledgement = await chatHub.sendMessage(chatId, draft.trim(), attempt.id);
      if (version !== scope.current.version) return;
      applyLive(acknowledgement);
      setMessage(current => (current === draft ? "" : current));
      if (draftAttempts.current.get(chatId)?.id === attempt.id)
        draftAttempts.current.delete(chatId);
    } catch (error) {
      if (version === scope.current.version)
        setSendError(
          error instanceof Error
            ? error.message
            : "Message could not be sent. Your draft was kept; please retry."
        );
    } finally {
      if (version === scope.current.version) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, [message, currentUser, chatId, applyLive]);
  const loadOlder = useCallback(async () => {
    if (!hasOlder || olderRef.current || !oldest.current) return;
    olderRef.current = true;
    setLoadingOlder(true);
    setHistoryError("");
    const version = scope.current.version;
    try {
      const messages = await userApi.getChatMessages(chatId, 1, 50, oldest.current);
      if (version !== scope.current.version) return;
      const mapped = messages.map(value =>
        mapChatMessage(value as unknown as Record<string, unknown>)
      );
      merge(mapped);
      oldest.current = mergeChatMessages([], mapped)[0]?.messageId || oldest.current;
      setHasOlder(messages.length === 50);
    } catch (error) {
      if (version === scope.current.version)
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Older messages could not be loaded. Please retry."
        );
    } finally {
      if (version === scope.current.version) {
        olderRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [hasOlder, chatId, merge]);
  const reconnect = useCallback(async () => {
    setSendError("");
    try {
      await chatHub.joinChat(chatId);
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Conversation could not reconnect. Please retry."
      );
    }
  }, [chatId]);
  return {
    currentUser,
    otherParticipant,
    chat,
    chatMessages,
    isLoading,
    loadError,
    message,
    setMessage,
    sending,
    sendError,
    readError,
    historyError,
    loadingOlder,
    hasOlder,
    connectionState,
    isConnected,
    handleSendMessage,
    loadOlder,
    reconnect,
    retryLoad: () => setRevision(previous => previous + 1),
    retryRead: () => {
      readFailed.current = false;
      setReadRevision(previous => previous + 1);
    },
    refreshMessages: () => {
      if (historyNeedsReload) {
        setRevision(previous => previous + 1);
        return;
      }
      void refreshLatest(scope.current.version)
        .then(() => setHistoryError(""))
        .catch(error =>
          setHistoryError(
            error instanceof Error
              ? error.message
              : "Messages could not be refreshed. Please retry."
          )
        );
    },
  };
}

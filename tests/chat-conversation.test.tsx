import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHubHandlers } from "../src/lib/chatHub";
const fixture = vi.hoisted(() => ({
  handlers: {} as ChatHubHandlers,
  messages: vi.fn(),
  send: vi.fn(),
  read: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({
  identityApi: { getCurrentUser: () => ({ id: "alice", username: "Alice" }) },
  userApi: {
    getCurrentUserProfile: async () => ({ id: "alice", username: "Alice" }),
    getChat: async (chatId: string) => ({
      chatId,
      participants: ["alice", "bob"],
      isGroup: false,
      lastActivity: "2026-10-04T00:00:00Z",
    }),
    getUserProfilesBatch: async () => [{ id: "bob", username: "Bob" }],
    getChatMessages: (...args: unknown[]) => fixture.messages(...args),
  },
}));
vi.mock("../src/lib/chatHub", () => ({
  chatHub: {
    getConnectionState: () => "Connected",
    setHandlers: (handlers: ChatHubHandlers) => {
      fixture.handlers = handlers;
      handlers.onConnectionStateChange?.("Connected" as never);
    },
    removeHandlers: () => {
      fixture.handlers = {};
    },
    joinChat: async (id: string) => {
      fixture.join(id);
      fixture.handlers.onChatJoined?.(id);
    },
    leaveChat: (...args: unknown[]) => fixture.leave(...args),
    sendMessage: (...args: unknown[]) => fixture.send(...args),
    markMessagesReadThrough: (...args: unknown[]) => fixture.read(...args),
  },
}));
import { useChatConversation } from "../src/hooks/useChatConversation";
const apiMessage = (id: number, senderId = "bob") => ({
  messageId: id.toString(16).padStart(24, "0"),
  chatId: "chat-a",
  senderId,
  senderName: senderId,
  content: `message-${id}`,
  sentAt: new Date(Date.UTC(2026, 9, 4, 0, 0, id)).toISOString(),
  readBy: [],
  isRead: false,
});
const realtime = (id: number, senderId = "bob") => ({
  ...apiMessage(id, senderId),
  timestamp: apiMessage(id).sentAt,
});
afterEach(cleanup);
beforeEach(() => {
  fixture.handlers = {};
  fixture.messages.mockReset().mockResolvedValue([]);
  fixture.send.mockReset();
  fixture.read.mockReset().mockResolvedValue(undefined);
  fixture.join.mockReset();
  fixture.leave.mockReset().mockResolvedValue(undefined);
});
describe("conversation recovery, history and drafts", () => {
  it("invalidates a held recovery page after a second loss and keeps the earliest contiguous boundary", async () => {
    let stage = 0;
    let resolveFirst!: (messages: ReturnType<typeof apiMessage>[]) => void;
    const firstRecovery = new Promise<ReturnType<typeof apiMessage>[]>(done => {
      resolveFirst = done;
    });
    const page = (first: number) =>
      Array.from({ length: 50 }, (_, index) =>
        apiMessage(first + index, first + index <= 100 ? "alice" : "bob")
      );
    fixture.messages.mockImplementation(
      async (_chat: string, _page?: number, _size?: number, before?: string) => {
        if (stage === 1 && before === apiMessage(132).messageId) return firstRecovery;
        return page(
          before ? Number.parseInt(before, 16) - 50 : stage === 2 ? 251 : stage === 1 ? 132 : 51
        );
      }
    );
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(50));
    stage = 1;
    act(() => {
      fixture.handlers.onConnectionStateChange?.("Reconnecting" as never);
      fixture.handlers.onConnectionStateChange?.("Connected" as never);
      fixture.handlers.onMessageReceived?.(realtime(181));
      fixture.handlers.onChatJoined?.("chat-a");
    });
    await waitFor(() =>
      expect(fixture.messages).toHaveBeenCalledWith("chat-a", 1, 50, apiMessage(132).messageId)
    );
    act(() => fixture.handlers.onConnectionStateChange?.("Reconnecting" as never));
    await act(async () => resolveFirst(page(82)));
    expect(view.result.current.chatMessages).toHaveLength(50);
    expect(fixture.read).not.toHaveBeenCalled();
    stage = 2;
    act(() => {
      fixture.handlers.onConnectionStateChange?.("Connected" as never);
      fixture.handlers.onMessageReceived?.(realtime(300));
    });
    expect(view.result.current.chatMessages).toHaveLength(50);
    act(() => fixture.handlers.onChatJoined?.("chat-a"));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(250));
    expect(view.result.current.chatMessages.map(message => message.content)).toEqual(
      Array.from({ length: 250 }, (_, index) => `message-${index + 51}`)
    );
    await waitFor(() =>
      expect(fixture.read).toHaveBeenCalledWith("chat-a", apiMessage(300).messageId)
    );
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });
  it("keeps the old contiguous view at the catchup cap, then retries with a pageable contiguous latest window", async () => {
    let offlineArrivals = false;
    fixture.messages.mockImplementation(
      async (_chat: string, _page?: number, _size?: number, before?: string) => {
        const start = before ? Number.parseInt(before, 16) - 50 : offlineArrivals ? 1052 : 1;
        return Array.from({ length: 50 }, (_, index) => apiMessage(start + index, "alice"));
      }
    );
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(50));
    offlineArrivals = true;
    act(() => {
      fixture.handlers.onConnectionStateChange?.("Reconnecting" as never);
      fixture.handlers.onMessageReceived?.(realtime(1101));
      fixture.handlers.onConnectionStateChange?.("Connected" as never);
      fixture.handlers.onChatJoined?.("chat-a");
    });
    await waitFor(() =>
      expect(view.result.current.historyError).toContain("Reload this conversation")
    );
    expect(view.result.current.chatMessages.map(message => message.content)).toEqual(
      Array.from({ length: 50 }, (_, index) => `message-${index + 1}`)
    );
    act(() => view.result.current.refreshMessages());
    expect(fixture.read).not.toHaveBeenCalled();
    await waitFor(() => expect(view.result.current.chatMessages[0]?.content).toBe("message-1052"));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.historyError).toBe("");
    expect(view.result.current.hasOlder).toBe(true);
    await act(async () => view.result.current.loadOlder());
    expect(view.result.current.chatMessages).toHaveLength(100);
    expect(view.result.current.chatMessages[0].content).toBe("message-1002");
  });
  it("retains a lost-ack UUID for each conversation while another conversation is sent", async () => {
    fixture.send.mockRejectedValueOnce(new Error("Acknowledgement was lost"));
    const view = renderHook(({ chat }) => useChatConversation(chat), {
      initialProps: { chat: "chat-a" },
    });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    act(() => view.result.current.setMessage("persisted without ack"));
    await act(async () => view.result.current.handleSendMessage());
    const attemptA = fixture.send.mock.calls[0][2];
    view.rerender({ chat: "chat-b" });
    await waitFor(() => expect(view.result.current.chat?.chatId).toBe("chat-b"));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    fixture.send.mockResolvedValueOnce({ ...realtime(2, "alice"), chatId: "chat-b" });
    act(() => view.result.current.setMessage("separate draft"));
    await act(async () => view.result.current.handleSendMessage());
    view.rerender({ chat: "chat-a" });
    await waitFor(() => expect(view.result.current.message).toBe("persisted without ack"));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    fixture.send.mockResolvedValueOnce(realtime(1, "alice"));
    await act(async () => view.result.current.handleSendMessage());
    expect(fixture.send.mock.calls[2][2]).toBe(attemptA);
    expect(fixture.send.mock.calls[1][2]).not.toBe(attemptA);
    expect(view.result.current.message).toBe("");
  });
  it.each([true, false])(
    "retains the highest peer read cutoff when an older receipt arrives (timestamp=%s)",
    async withTimestamp => {
      fixture.messages.mockResolvedValue([apiMessage(1, "alice"), apiMessage(4, "alice")]);
      const view = renderHook(() => useChatConversation("chat-a"));
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      let resolve!: (messages: ReturnType<typeof apiMessage>[]) => void;
      const pending = new Promise<ReturnType<typeof apiMessage>[]>(done => {
        resolve = done;
      });
      fixture.messages.mockReturnValue(pending);
      act(() =>
        fixture.handlers.onAllMessagesRead?.({
          chatId: "chat-a",
          userId: "bob",
          readAt: apiMessage(4).sentAt,
          throughMessageId: apiMessage(4).messageId,
          throughSentAt: apiMessage(4).sentAt,
        })
      );
      act(() =>
        fixture.handlers.onAllMessagesRead?.({
          chatId: "chat-a",
          userId: "bob",
          readAt: apiMessage(1).sentAt,
          throughMessageId: apiMessage(1).messageId,
          throughSentAt: withTimestamp ? apiMessage(1).sentAt : undefined,
        })
      );
      await act(async () => resolve([apiMessage(2, "alice"), apiMessage(3, "alice")]));
      await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(4));
      expect(view.result.current.chatMessages.every(message => message.isRead)).toBe(true);
    }
  );
  it("recovers every missed message even when a personal live packet arrives before room rejoin", async () => {
    let recovered = false;
    let manualRefresh = false;
    let resolvePrevious!: (messages: ReturnType<typeof apiMessage>[]) => void;
    const previous = new Promise<ReturnType<typeof apiMessage>[]>(done => {
      resolvePrevious = done;
    });
    let resolveOlder!: (messages: ReturnType<typeof apiMessage>[]) => void;
    const older = new Promise<ReturnType<typeof apiMessage>[]>(done => {
      resolveOlder = done;
    });
    const page = (first: number) =>
      Array.from({ length: 50 }, (_, index) =>
        apiMessage(first + index, first + index <= 100 ? "alice" : "bob")
      );
    fixture.messages.mockImplementation(
      async (_chat: string, _page?: number, _size?: number, before?: string) => {
        if (before) return older;
        if (manualRefresh && !recovered) return previous;
        return page(recovered ? 132 : 51);
      }
    );
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(50));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    manualRefresh = true;
    act(() => view.result.current.refreshMessages());
    act(() => fixture.handlers.onConnectionStateChange?.("Reconnecting" as never));
    // A response begun before the disconnect must not clear the recovery boundary.
    await act(async () => resolvePrevious(page(51)));
    recovered = true;
    act(() => {
      fixture.handlers.onConnectionStateChange?.("Connected" as never);
      fixture.handlers.onMessageReceived?.(realtime(181));
    });
    expect(view.result.current.chatMessages).toHaveLength(50);
    act(() => {
      fixture.handlers.onChatJoined?.("chat-a");
    });
    await waitFor(() =>
      expect(fixture.messages).toHaveBeenCalledWith("chat-a", 1, 50, apiMessage(132).messageId)
    );
    expect(view.result.current.chatMessages).toHaveLength(50);
    expect(fixture.read).not.toHaveBeenCalled();
    await act(async () => resolveOlder(page(82)));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(131));
    expect(view.result.current.chatMessages.map(message => message.content)).toEqual(
      Array.from({ length: 131 }, (_, index) => `message-${index + 51}`)
    );
    expect(fixture.messages).toHaveBeenCalledWith("chat-a", 1, 50, apiMessage(132).messageId);
    expect(view.result.current.hasOlder).toBe(true);
    await waitFor(() =>
      expect(fixture.read).toHaveBeenCalledWith("chat-a", apiMessage(181).messageId)
    );
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });
  it("merges a live message into delayed initial history and keeps stable chronological order", async () => {
    let resolve!: (messages: ReturnType<typeof apiMessage>[]) => void;
    const delayed = new Promise<ReturnType<typeof apiMessage>[]>(done => {
      resolve = done;
    });
    fixture.messages.mockReturnValue(delayed);
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(fixture.handlers.onMessageReceived).toBeTypeOf("function"));
    act(() => fixture.handlers.onMessageReceived?.(realtime(2)));
    await act(async () => resolve([apiMessage(1)]));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.chatMessages.map(message => message.content)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(fixture.read).toHaveBeenCalledWith("chat-a", apiMessage(2).messageId);
  });
  it("loads history with an immutable before cursor even while a new message arrives", async () => {
    const first = Array.from({ length: 50 }, (_, index) => apiMessage(index + 2));
    fixture.messages.mockImplementation(
      async (_chat: string, _page?: number, _size?: number, before?: string) =>
        before ? [apiMessage(1)] : first
    );
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.hasOlder).toBe(true));
    act(() => fixture.handlers.onMessageReceived?.(realtime(52)));
    await act(async () => view.result.current.loadOlder());
    expect(fixture.messages).toHaveBeenCalledWith("chat-a", 1, 50, apiMessage(2).messageId);
    expect(view.result.current.chatMessages).toHaveLength(52);
    expect(view.result.current.chatMessages[0].content).toBe("message-1");
    expect(view.result.current.hasOlder).toBe(false);
  });
  it("keeps a failed draft and retry UUID, while edited content gets a fresh operation", async () => {
    fixture.send.mockRejectedValue(new Error("Controlled message failure"));
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.isConnected).toBe(true));
    act(() => view.result.current.setMessage("kept draft"));
    await act(async () => view.result.current.handleSendMessage());
    const id = fixture.send.mock.calls[0][2];
    expect(view.result.current.message).toBe("kept draft");
    await act(async () => view.result.current.handleSendMessage());
    expect(fixture.send.mock.calls[1][2]).toBe(id);
    act(() => view.result.current.setMessage("edited draft"));
    await act(async () => view.result.current.handleSendMessage());
    expect(fixture.send.mock.calls[2][2]).not.toBe(id);
    expect(view.result.current.message).toBe("edited draft");
  });
  it("preserves a new draft typed during acknowledgement and deduplicates its live echo", async () => {
    let acknowledge!: (message: ReturnType<typeof realtime>) => void;
    fixture.send.mockImplementation(
      () =>
        new Promise(resolve => {
          acknowledge = resolve;
        })
    );
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.isConnected).toBe(true));
    act(() => view.result.current.setMessage("sending"));
    let pending!: Promise<void>;
    act(() => {
      pending = view.result.current.handleSendMessage();
    });
    act(() => view.result.current.setMessage("next draft"));
    const saved = { ...realtime(1, "alice"), content: "sending" };
    act(() => fixture.handlers.onMessageReceived?.(saved));
    await act(async () => {
      acknowledge(saved);
      await pending;
    });
    expect(view.result.current.message).toBe("next draft");
    expect(view.result.current.chatMessages).toHaveLength(1);
  });
  it("does not let a peer snapshot mark a newer message as read", async () => {
    fixture.messages.mockResolvedValue([apiMessage(1, "alice"), apiMessage(2, "alice")]);
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(2));
    act(() =>
      fixture.handlers.onAllMessagesRead?.({
        chatId: "chat-a",
        userId: "bob",
        readAt: apiMessage(1).sentAt,
        throughMessageId: apiMessage(1).messageId,
        throughSentAt: apiMessage(1).sentAt,
      })
    );
    await waitFor(() => expect(view.result.current.chatMessages[0].isRead).toBe(true));
    expect(view.result.current.chatMessages[1].isRead).toBe(false);
  });
  it("ignores a history response from a previous conversation after route navigation", async () => {
    let old!: (messages: ReturnType<typeof apiMessage>[]) => void;
    fixture.messages.mockImplementation((chat: string) =>
      chat === "chat-a"
        ? new Promise(resolve => {
            old = resolve;
          })
        : Promise.resolve([])
    );
    const view = renderHook(({ chat }) => useChatConversation(chat), {
      initialProps: { chat: "chat-a" },
    });
    await waitFor(() => expect(old).toBeTypeOf("function"));
    view.rerender({ chat: "chat-b" });
    await waitFor(() => expect(view.result.current.chat?.chatId).toBe("chat-b"));
    await act(async () => old([apiMessage(1)]));
    expect(view.result.current.chatMessages).toEqual([]);
  });
  it("does not treat our own inbound read acknowledgement as a peer reading our outgoing messages", async () => {
    fixture.messages.mockResolvedValue([apiMessage(1, "alice"), apiMessage(2, "bob")]);
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.chatMessages).toHaveLength(2));
    act(() =>
      fixture.handlers.onAllMessagesRead?.({
        chatId: "chat-a",
        userId: "alice",
        readAt: apiMessage(2).sentAt,
        throughMessageId: apiMessage(2).messageId,
        throughSentAt: apiMessage(2).sentAt,
      })
    );
    act(() =>
      fixture.handlers.onMessageRead?.(apiMessage(1).messageId, {
        chatId: "chat-a",
        userId: "alice",
      })
    );
    expect(view.result.current.chatMessages[0].isRead).toBe(false);
  });
  it("saves the visible snapshot once when a background conversation becomes visible", async () => {
    const visibility = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fixture.messages.mockResolvedValue([apiMessage(1)]);
    const view = renderHook(() => useChatConversation("chat-a"));
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.isConnected).toBe(true);
    expect(fixture.read).not.toHaveBeenCalled();
    visibility.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() =>
      expect(fixture.read).toHaveBeenCalledWith("chat-a", apiMessage(1).messageId)
    );
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });
});

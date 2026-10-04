import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  generation: 0,
  token: "current-access",
  connections: [] as FakeConnection[],
  deferred: null as Promise<void> | null,
}));
class FakeConnection {
  state = "Disconnected";
  start = vi.fn(async () => {
    this.state = "Connecting";
    if (fixture.deferred) await fixture.deferred;
    this.state = "Connected";
  });
  stop = vi.fn(async () => {
    this.state = "Disconnected";
  });
  invoke = vi.fn(async (method: string) =>
    method === "SendMessage"
      ? {
          id: "saved-message",
          chatId: "chat-a",
          senderId: "alice",
          content: "hello",
          createdAt: new Date().toISOString(),
        }
      : undefined
  );
  handlers = new Map<string, (...arguments_: never[]) => void>();
  reconnecting: () => void = () => undefined;
  reconnected: () => Promise<void> = async () => undefined;
  on(event: string, handler: (...arguments_: never[]) => void) {
    this.handlers.set(event, handler);
  }
  onreconnecting(handler: () => void) {
    this.reconnecting = handler;
  }
  onreconnected(handler: () => Promise<void>) {
    this.reconnected = handler;
  }
  onclose() {}
}
vi.mock("@microsoft/signalr", () => ({
  HubConnectionState: {
    Disconnected: "Disconnected",
    Connecting: "Connecting",
    Connected: "Connected",
    Reconnecting: "Reconnecting",
  },
  LogLevel: { None: 6 },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      const connection = new FakeConnection();
      fixture.connections.push(connection);
      return connection;
    }
  },
}));
vi.mock("../src/lib/session", () => ({
  ensureAccessToken: async () => fixture.token,
  getSessionUser: () => ({ id: "alice" }),
  getSessionGeneration: () => fixture.generation,
  SESSION_EVENT: "test:session",
}));
vi.mock("../src/lib/notificationService", () => ({
  notificationService: { handleMessage: vi.fn() },
}));
beforeEach(() => {
  fixture.connections.length = 0;
  fixture.generation = 0;
  fixture.deferred = null;
  vi.resetModules();
});
describe("hub lifecycle and acknowledged chat", () => {
  it("shares a single start and retains a desired room until connected", async () => {
    const { ChatHubService } = await import("../src/lib/chatHub");
    const service = new ChatHubService();
    await Promise.all([
      service.joinChat("chat-a"),
      service.enableConnection(),
      service.joinChat("chat-a"),
    ]);
    const connection = fixture.connections[0];
    expect(fixture.connections).toHaveLength(1);
    expect(connection.start).toHaveBeenCalledTimes(1);
    expect(connection.invoke.mock.calls.filter(([method]) => method === "JoinChat")).toHaveLength(
      1
    );
    expect((await service.sendMessage("chat-a", "hello", "stable-draft-id")).messageId).toBe(
      "saved-message"
    );
    expect(connection.invoke).toHaveBeenCalledWith(
      "SendMessage",
      "chat-a",
      "hello",
      "stable-draft-id"
    );
    await service.disconnect();
  });
  it("reports connected state to a subscriber mounted after background startup", async () => {
    const { ChatHubService } = await import("../src/lib/chatHub");
    const service = new ChatHubService();
    await service.enableConnection();
    const state = vi.fn();
    const joined = vi.fn();
    service.setHandlers({ onConnectionStateChange: state, onChatJoined: joined });
    await service.joinChat("chat-a");
    expect(state).toHaveBeenCalledWith("Connected");
    expect(joined).toHaveBeenCalledWith("chat-a");
    await service.disconnect();
  });
  it("rejoins on reconnect and rejects sends while disconnected without consuming a draft", async () => {
    const { ChatHubService } = await import("../src/lib/chatHub");
    const service = new ChatHubService();
    await service.joinChat("chat-a");
    const connection = fixture.connections[0];
    connection.state = "Reconnecting";
    connection.reconnecting();
    await expect(service.sendMessage("chat-a", "kept draft")).rejects.toThrow("draft");
    connection.state = "Connected";
    await connection.reconnected();
    expect(connection.invoke.mock.calls.filter(([method]) => method === "JoinChat")).toHaveLength(
      2
    );
    await service.leaveChat("chat-a");
    await expect(service.sendMessage("chat-a", "kept draft")).rejects.toThrow("draft");
    await service.disconnect();
  });
  it("stops a connecting hub and prevents delayed startup from rejoining after logout", async () => {
    let resolve!: () => void;
    fixture.deferred = new Promise<void>(done => {
      resolve = done;
    });
    const { ChatHubService } = await import("../src/lib/chatHub");
    const service = new ChatHubService();
    const startup = service.joinChat("chat-a");
    await Promise.resolve();
    await Promise.resolve();
    const connection = fixture.connections[0];
    fixture.generation++;
    await service.disableConnection();
    resolve();
    await expect(startup).rejects.toThrow("unavailable");
    expect(connection.stop).toHaveBeenCalled();
    expect(connection.invoke).not.toHaveBeenCalled();
    expect(service.getConnectionState()).toBe("Disconnected");
  });
});

describe("independent realtime subscribers and canonical friendship contracts", () => {
  it("keeps another chat subscriber when one view unmounts and ignores own read receipts", async () => {
    const { ChatHubService } = await import("../src/lib/chatHub");
    const service = new ChatHubService();
    await service.enableConnection();
    const first = vi.fn();
    const second = vi.fn();
    const read = vi.fn();
    service.setHandlers({ onMessageReceived: first }, "first");
    service.setHandlers({ onMessageReceived: second, onAllMessagesRead: read }, "second");
    service.removeHandlers("first");
    const connection = fixture.connections[0];
    connection.handlers.get("ReceiveMessage")?.({
      messageId: "saved",
      chatId: "chat-a",
      senderId: "bob",
      content: "hi",
      sentAt: "2026-10-04T00:00:00Z",
    } as never);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    connection.handlers.get("AllMessagesRead")?.({
      chatId: "chat-a",
      userId: "alice",
      throughMessageId: "saved",
    } as never);
    expect(read).not.toHaveBeenCalled();
    connection.handlers.get("AllMessagesRead")?.({
      chatId: "chat-a",
      userId: "bob",
      throughMessageId: "saved",
      throughSentAt: "2026-10-04T00:00:00Z",
    } as never);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "bob", throughMessageId: "saved" })
    );
    await service.disconnect();
  });
  it("undoes a room join completed after navigation without marking the old room active", async () => {
    const { ChatHubService } = await import("../src/lib/chatHub");
    const service = new ChatHubService();
    await service.enableConnection();
    const connection = fixture.connections[0];
    let finish!: () => void;
    connection.invoke.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => {
        finish = resolve;
      });
      return undefined;
    });
    const oldJoin = service.joinChat("chat-a");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await service.leaveChat("chat-a");
    await service.joinChat("chat-b");
    finish();
    await oldJoin;
    expect(service.getCurrentChatId()).toBe("chat-b");
    expect(connection.invoke).toHaveBeenCalledWith("LeaveChat", "chat-a");
    await service.disconnect();
  });
  it("normalizes canonical requester fields and terminal friendship IDs for every subscriber", async () => {
    const { FriendHubManager } = await import("../src/lib/friendHub");
    const manager = new FriendHubManager();
    const received = vi.fn();
    const removed = vi.fn();
    const cancelled = vi.fn();
    const other = vi.fn();
    const stop = manager.subscribe({
      onFriendRequestReceived: received,
      onFriendRemoved: removed,
      onFriendRequestCancelled: cancelled,
    });
    manager.subscribe({ onFriendRequestReceived: other });
    await manager.connect("alice");
    const connection = fixture.connections[0];
    const value = {
      requestId: "request-1",
      requesterId: "bob",
      requesterUsername: "Bob",
      requestedAt: "2026-10-04T00:00:00Z",
    };
    connection.handlers.get("FriendRequestReceived")?.(value as never);
    expect(received).toHaveBeenCalledWith({
      requestId: "request-1",
      senderId: "bob",
      senderName: "Bob",
      senderAvatar: undefined,
      timestamp: value.requestedAt,
    });
    connection.handlers.get("FriendRemoved")?.({
      friendId: "bob",
      friendshipId: "request-1",
    } as never);
    expect(removed).toHaveBeenCalledWith(
      expect.objectContaining({ friendId: "bob", requestId: "request-1" })
    );
    connection.handlers.get("FriendRequestCancelled")?.({
      friendId: "bob",
      requestId: "request-1",
    } as never);
    expect(cancelled).toHaveBeenCalledWith(
      expect.objectContaining({ friendId: "bob", requestId: "request-1" })
    );
    stop();
    connection.handlers.get("FriendRequestReceived")?.(value as never);
    expect(received).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(2);
    const late = vi.fn();
    manager.subscribe({ onConnectionStateChanged: late });
    expect(late).toHaveBeenCalledWith("Connected");
    expect(connection.stop).not.toHaveBeenCalled();
    await manager.disconnect();
  });
});

it("cannot report an obsolete delayed connection callback as connected after session teardown", async () => {
  const { ManagedHub } = await import("../src/lib/managedHub");
  const state = vi.fn();
  let finish!: () => void;
  const hub = new ManagedHub(
    "delayed",
    () => undefined,
    async () => {
      await new Promise<void>(resolve => {
        finish = resolve;
      });
    },
    state
  );
  const startup = hub.start();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  fixture.generation++;
  await hub.stop();
  finish();
  await startup;
  expect(state.mock.calls.at(-1)?.[0]).toBe("Disconnected");
  expect(state).not.toHaveBeenCalledWith("Connected");
});

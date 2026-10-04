import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FriendHubHandlers } from "../src/lib/friendHub";
const fixture = vi.hoisted(() => ({
  subscribers: new Set<FriendHubHandlers>(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../src/lib/friendHub", () => ({
  friendHubManager: {
    subscribe: (handlers: FriendHubHandlers) => {
      fixture.subscribers.add(handlers);
      handlers.onConnectionStateChanged?.("Connected");
      return () => {
        fixture.subscribers.delete(handlers);
      };
    },
    connect: (...args: unknown[]) => fixture.connect(...args),
    disconnect: () => fixture.disconnect(),
  },
}));
import { useFriendHub } from "../src/hooks/useFriendHub";
afterEach(cleanup);
beforeEach(() => {
  fixture.subscribers.clear();
  fixture.connect.mockResolvedValue(undefined);
  fixture.disconnect.mockResolvedValue(undefined);
});
it("unmounting one consumer keeps another consumer connected and deduplicates repeated requests", async () => {
  const first = renderHook(() => useFriendHub({ userId: "alice" }));
  const second = renderHook(() => useFriendHub({ userId: "alice" }));
  await waitFor(() => expect(fixture.subscribers.size).toBe(2));
  first.unmount();
  expect(fixture.disconnect).not.toHaveBeenCalled();
  const request = {
    requestId: "request",
    senderId: "bob",
    senderName: "Bob",
    timestamp: "2026-10-04T00:00:00Z",
  };
  act(() => {
    for (const subscriber of fixture.subscribers) {
      subscriber.onFriendRequestReceived?.(request);
      subscriber.onFriendRequestReceived?.(request);
    }
  });
  expect(second.result.current.friendRequests).toEqual([request]);
  expect(second.result.current.isConnected).toBe(true);
});
it("drops the previous account's request state when ownership becomes unauthenticated", async () => {
  const view = renderHook(({ userId }) => useFriendHub({ userId }), {
    initialProps: { userId: "alice" as string | undefined },
  });
  await waitFor(() => expect(fixture.subscribers.size).toBe(1));
  act(() => {
    for (const subscriber of fixture.subscribers)
      subscriber.onFriendRequestReceived?.({
        requestId: "request",
        senderId: "bob",
        senderName: "Bob",
        timestamp: "2026-10-04T00:00:00Z",
      });
  });
  expect(view.result.current.friendRequests).toHaveLength(1);
  view.rerender({ userId: undefined });
  await waitFor(() => expect(view.result.current.friendRequests).toEqual([]));
  expect(fixture.subscribers.size).toBe(0);
});

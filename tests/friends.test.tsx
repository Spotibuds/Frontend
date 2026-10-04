import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  incoming: true,
  outgoing: true,
  accepted: false,
  cancelFails: false,
  respondFails: false,
  cancel: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../src/hooks/useFriendHub", () => ({
  useFriendHub: () => ({
    isConnected: false,
    connectionState: "Disconnected",
    error: null,
    connect: vi.fn(),
  }),
}));
vi.mock("../src/lib/api", () => ({
  identityApi: { getCurrentUser: () => ({ id: "alice", username: "Alice" }) },
  userApi: {
    getPendingFriendRequests: async () =>
      fixture.incoming
        ? [
            {
              requestId: "incoming-1",
              requesterId: "bob",
              requesterUsername: "Bob",
              requestedAt: "2026-10-04T00:00:00Z",
            },
          ]
        : [],
    getSentFriendRequests: async () =>
      fixture.outgoing
        ? [
            {
              requestId: "outgoing-1",
              addresseeId: "carol",
              addresseeUsername: "Carol",
              requestedAt: "2026-10-04T00:00:00Z",
            },
          ]
        : [],
    getFriends: async () => (fixture.accepted ? ["bob"] : []),
    getUserProfilesBatch: async () => [{ id: "bob", username: "Bob" }],
    cancelFriendRequest: async (id: string) => {
      fixture.cancel(id);
      if (fixture.cancelFails) throw new Error("Controlled cancellation failure");
      fixture.outgoing = false;
    },
    acceptFriendRequest: async (id: string, user: string) => {
      fixture.accept(id, user);
      if (fixture.respondFails) throw new Error("Controlled response failure");
      fixture.incoming = false;
      fixture.accepted = true;
    },
    declineFriendRequest: async (id: string, user: string) => {
      fixture.decline(id, user);
      fixture.incoming = false;
    },
    getFriendshipStatus: async () => ({ status: "accepted", friendshipId: "incoming-1" }),
    removeFriend: async () => {
      fixture.remove();
      fixture.accepted = false;
    },
    searchUsers: async () => [{ id: "bob", username: "Bob" }],
  },
}));
vi.mock("../src/components/ui/MusicImage", () => ({ default: () => null }));
vi.mock("../src/components/ui/Toast", () => ({
  Toast: ({ message }: { message: string }) => <p role="status">{message}</p>,
}));
import FriendsPage from "../src/app/friends/page";
import { eventBus } from "../src/lib/eventBus";
afterEach(cleanup);
beforeEach(() => {
  fixture.incoming = true;
  fixture.outgoing = true;
  fixture.accepted = false;
  fixture.cancelFails = false;
  fixture.respondFails = false;
});
describe("friend request UI transitions without an own realtime echo", () => {
  it("keeps a retained search card disabled after a live incoming request is accepted", async () => {
    render(<FriendsPage />);
    const accept = await screen.findByRole("button", { name: "Accept friend request from Bob" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search users..." }), {
      target: { value: "Bob" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("heading", { name: "Search Results" });
    fireEvent.click(accept);
    const friends = await screen.findByRole("button", { name: "Friends" });
    expect((friends as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });
  it("keeps an outgoing request on cancellation failure, then removes it on successful retry", async () => {
    render(<FriendsPage />);
    const cancel = await screen.findByRole("button", { name: "Cancel friend request to Carol" });
    fixture.cancelFails = true;
    fireEvent.click(cancel);
    await screen.findByText("Controlled cancellation failure");
    expect(screen.getByRole("button", { name: "Cancel friend request to Carol" })).toBeTruthy();
    fixture.cancelFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Cancel friend request to Carol" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel friend request to Carol" })).toBeNull()
    );
    expect(fixture.cancel).toHaveBeenCalledWith("outgoing-1");
    expect(screen.getByText("No outgoing requests")).toBeTruthy();
  });
  it("keeps a rejected accept action, then adds the friend and locally removes it after success", async () => {
    render(<FriendsPage />);
    const accept = await screen.findByRole("button", { name: "Accept friend request from Bob" });
    fixture.respondFails = true;
    fireEvent.click(accept);
    await screen.findByText("Controlled response failure");
    expect(screen.getByRole("button", { name: "Accept friend request from Bob" })).toBeTruthy();
    fixture.respondFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Accept friend request from Bob" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Friends (1)" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Accept friend request from Bob" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Friends (0)" })).toBeTruthy());
    expect(fixture.accept).toHaveBeenCalledWith("incoming-1", "alice");
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });
  it("declines incoming requests and refreshes a remote cancellation without appending malformed events", async () => {
    render(<FriendsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline friend request from Bob" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Decline friend request from Bob" })).toBeNull()
    );
    expect(fixture.decline).toHaveBeenCalledWith("incoming-1", "alice");
    fixture.outgoing = false;
    eventBus.emit("friendshipStatusChanged", "alice", "carol");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel friend request to Carol" })).toBeNull()
    );
  });
});

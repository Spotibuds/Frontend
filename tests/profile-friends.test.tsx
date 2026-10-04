import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  status: "none",
  requesterId: "alice",
  failRead: false,
  router: { push: vi.fn(), replace: vi.fn() },
  mutation: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "bob" }),
  useRouter: () => fixture.router,
}));
vi.mock("../src/hooks/useFriendHub", () => ({ useFriendHub: () => ({ isConnected: false }) }));
vi.mock("../src/components/ui/MusicImage", () => ({ default: () => null }));
vi.mock("../src/lib/playlist", () => ({ PlaylistService: { getUserPlaylists: async () => [] } }));
vi.mock("../src/lib/api", () => ({
  safeString: (value: unknown) => String(value || ""),
  identityApi: { getCurrentUser: () => ({ id: "alice", username: "Alice" }) },
  userApi: {
    getUserProfile: async () => ({ id: "bob", username: "Bob" }),
    getListeningHistory: async () => [],
    getWeeklyTopArtists: async () => [],
    getLatestReactions: async () => [],
    getFriends: async () => [],
    checkIfFollowing: async () => false,
    getFriendshipStatus: async () => {
      if (fixture.failRead) throw new Error("503");
      return {
        status: fixture.status,
        friendshipId: "attempt-1",
        requesterId: fixture.requesterId,
      };
    },
    sendFriendRequest: (...args: unknown[]) => fixture.mutation(...args),
    acceptFriendRequest: (...args: unknown[]) => fixture.mutation(...args),
    declineFriendRequest: (...args: unknown[]) => fixture.mutation(...args),
    cancelFriendRequest: (...args: unknown[]) => fixture.mutation(...args),
    removeFriend: (...args: unknown[]) => fixture.mutation(...args),
  },
}));
import UserProfilePage from "../src/app/user/[id]/page";
afterEach(cleanup);
beforeEach(() => {
  fixture.status = "none";
  fixture.requesterId = "alice";
  fixture.failRead = false;
  fixture.mutation.mockReset().mockImplementation(async () => {
    fixture.status = "none";
    throw new Error("This friendship attempt is no longer current.");
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
describe("profile friend controls", () => {
  it("blocks Add on a failed initial snapshot and supports a visible retry", async () => {
    fixture.failRead = true;
    render(<UserProfilePage />);
    await screen.findByRole("button", { name: "Retry friendship status" });
    expect(screen.queryByRole("button", { name: "Add Friend" })).toBeNull();
    fixture.failRead = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry friendship status" }));
    const add = await screen.findByRole("button", { name: "Add Friend" });
    expect((add as HTMLButtonElement).disabled).toBe(false);
  });
  it("refreshes a current accepted snapshot after a send conflict without hiding the error", async () => {
    fixture.mutation.mockImplementation(async () => {
      fixture.status = "accepted";
      throw new Error("You are already friends.");
    });
    render(<UserProfilePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Friend" }));
    await screen.findByRole("button", { name: "Remove Friend" });
    expect(screen.getByText("You are already friends.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Friend" })).toBeNull();
  });
  it.each([
    ["pending", "alice", "Cancel friend request to Bob"],
    ["pending", "bob", "Accept Request"],
    ["pending", "bob", "Decline"],
    ["accepted", "alice", "Remove Friend"],
  ])(
    "refreshes a stale %s action %s/%s while retaining its failure feedback",
    async (status, requester, label) => {
      fixture.status = status;
      fixture.requesterId = requester;
      render(<UserProfilePage />);
      fireEvent.click(await screen.findByRole("button", { name: label }));
      await waitFor(() => expect(fixture.mutation).toHaveBeenCalledTimes(1));
      await screen.findByRole("button", { name: "Add Friend" });
      expect(screen.getByText("This friendship attempt is no longer current.")).toBeTruthy();
    }
  );
});

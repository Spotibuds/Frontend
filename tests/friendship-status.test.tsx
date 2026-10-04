import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("../src/lib/api", () => ({
  userApi: { getFriendshipStatus: (...args: unknown[]) => fixture.status(...args) },
}));
import { useFriendshipStatus } from "../src/hooks/useFriendshipStatus";
afterEach(cleanup);
beforeEach(() => {
  fixture.status.mockReset().mockResolvedValue({ status: "none" });
});
describe("authoritative profile relationship snapshots", () => {
  it("does not let an old mutation's refresh invalidate the new target's pending snapshot", async () => {
    let resolve!: (snapshot: { status: "accepted" }) => void;
    fixture.status.mockImplementation((_user: string, target: string) =>
      target === "carol"
        ? new Promise(done => {
            resolve = done;
          })
        : Promise.resolve({ status: "none" })
    );
    const view = renderHook(({ target }) => useFriendshipStatus("alice", target), {
      initialProps: { target: "bob" },
    });
    await waitFor(() => expect(view.result.current.status?.status).toBe("none"));
    const oldRefresh = view.result.current.refresh;
    view.rerender({ target: "carol" });
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    await act(async () => oldRefresh());
    await act(async () => resolve({ status: "accepted" }));
    expect(view.result.current.status?.status).toBe("accepted");
  });
  it("keeps an accepted snapshot on outage and recovers a missed removal after reconnect", async () => {
    fixture.status.mockResolvedValue({ status: "accepted", friendshipId: "friend-1" });
    const view = renderHook(({ connected }) => useFriendshipStatus("alice", "bob", connected), {
      initialProps: { connected: false },
    });
    await waitFor(() => expect(view.result.current.status?.status).toBe("accepted"));
    fixture.status.mockRejectedValueOnce(new Error("503"));
    await act(async () => view.result.current.refresh());
    expect(view.result.current.status?.status).toBe("accepted");
    expect(view.result.current.error).toContain("could not be loaded");
    fixture.status.mockResolvedValue({ status: "none" });
    view.rerender({ connected: true });
    await waitFor(() => expect(view.result.current.status?.status).toBe("none"));
    expect(view.result.current.error).toBe("");
  });
  it("does not present an initial failed status read as no friendship", async () => {
    fixture.status.mockRejectedValueOnce(new Error("503"));
    const view = renderHook(() => useFriendshipStatus("alice", "bob"));
    await waitFor(() => expect(view.result.current.error).not.toBe(""));
    expect(view.result.current.status).toBeNull();
    await act(async () => view.result.current.refresh());
    expect(view.result.current.status?.status).toBe("none");
  });
  it("ignores a delayed response for a previous account or target", async () => {
    let resolve!: (snapshot: { status: "accepted" }) => void;
    fixture.status.mockImplementation((_user: string, target: string) =>
      target === "bob"
        ? new Promise(done => {
            resolve = done;
          })
        : Promise.resolve({ status: "none" })
    );
    const view = renderHook(({ target }) => useFriendshipStatus("alice", target), {
      initialProps: { target: "bob" },
    });
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    view.rerender({ target: "carol" });
    await waitFor(() => expect(view.result.current.status?.status).toBe("none"));
    await act(async () => resolve({ status: "accepted" }));
    expect(view.result.current.status?.status).toBe("none");
  });
});

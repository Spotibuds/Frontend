import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Playlist, PlaylistSong } from "@/lib/playlist";

const state = vi.hoisted(() => ({
  owner: "alice" as string | null,
  generation: 1,
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  getSessionUser: () => (state.owner ? { id: state.owner } : null),
  getSessionGeneration: () => state.generation,
  SESSION_EVENT: "spotibuds:session",
}));
vi.mock("@/lib/playlist", () => ({
  PLAYLIST_EVENT: "spotibuds:playlist-changed",
  PlaylistService: {
    getUserPlaylists: (...args: unknown[]) => state.list(...args),
    getPlaylist: (...args: unknown[]) => state.detail(...args),
    createPlaylist: (...args: unknown[]) => state.create(...args),
    addSongToPlaylist: (...args: unknown[]) => state.add(...args),
    removeSongFromPlaylist: (...args: unknown[]) => state.remove(...args),
  },
}));
import { FavoritesProvider, useFavorites } from "@/contexts/FavoritesContext";
import { ApiError } from "@/lib/request";

const song = (id: string): PlaylistSong => ({
  id,
  title: id,
  artists: [],
  durationSec: 60,
  position: 0,
  addedAt: "2026-10-04",
});
const playlist = (owner: string, ids: Iterable<string>): Playlist => ({
  id: `${owner}-liked`,
  name: "Liked Songs",
  createdBy: owner,
  songs: [...ids].map(song),
  createdAt: "2026-10-04",
  updatedAt: "2026-10-04",
});
let stored: Map<string, Set<string>>;
beforeEach(() => {
  state.owner = "alice";
  state.generation = 1;
  stored = new Map([["alice", new Set(["old-favorite"])]]);
  state.list
    .mockReset()
    .mockImplementation(async (owner: string) =>
      stored.has(owner) ? [playlist(owner, [...stored.get(owner)!].slice(0, 20))] : []
    );
  state.detail.mockReset().mockImplementation(async (id: string) => {
    const owner = id.replace(/-liked$/, "");
    return playlist(owner, stored.get(owner) || []);
  });
  state.create.mockReset().mockImplementation(async (owner: string) => {
    stored.set(owner, stored.get(owner) || new Set());
    return playlist(owner, stored.get(owner)!);
  });
  state.add.mockReset().mockImplementation(async (id: string, songId: string) => {
    stored.get(id.replace(/-liked$/, ""))!.add(songId);
  });
  state.remove.mockReset().mockImplementation(async (id: string, songId: string) => {
    stored.get(id.replace(/-liked$/, ""))!.delete(songId);
  });
});
afterEach(cleanup);
async function ready() {
  const hook = renderHook(() => useFavorites(), { wrapper: FavoritesProvider });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("favorites persistence and recovery", () => {
  it("hydrates the complete persisted list rather than its first 20 summary tracks", async () => {
    stored.set("alice", new Set(Array.from({ length: 25 }, (_, index) => `track-${index}`)));
    const { result } = await ready();
    expect(state.detail).toHaveBeenCalledWith("alice-liked");
    expect(result.current.ids.size).toBe(25);
    expect(result.current.ids.has("track-24")).toBe(true);
  });

  it("persists unlike and a new favorite through provider remount", async () => {
    const first = await ready();
    await act(async () => first.result.current.toggle("old-favorite"));
    expect(state.remove).toHaveBeenCalledWith("alice-liked", "old-favorite");
    expect(first.result.current.ids.has("old-favorite")).toBe(false);
    await act(async () => first.result.current.toggle("new-favorite"));
    first.unmount();
    const second = await ready();
    expect([...second.result.current.ids]).toEqual(["new-favorite"]);
    expect(state.create).not.toHaveBeenCalled();
  });

  it.each(["add", "remove"] as const)(
    "preserves membership when %s fails and allows retry",
    async operation => {
      const { result } = await ready();
      const id = operation === "add" ? "new-favorite" : "old-favorite";
      state[operation].mockRejectedValueOnce(new ApiError("Music is unavailable.", 503));
      await act(async () => {
        await expect(result.current.toggle(id)).rejects.toThrow("Music is unavailable.");
      });
      expect(result.current.ids.has(id)).toBe(operation === "remove");
      expect(result.current.pending.size).toBe(0);
      expect(result.current.error).toBe("Music is unavailable.");
      await act(async () => result.current.toggle(id));
      expect(result.current.ids.has(id)).toBe(operation === "add");
      expect(result.current.error).toBeNull();
    }
  );

  it("creates one private favorites list for simultaneous first likes", async () => {
    stored.clear();
    const { result } = await ready();
    await act(async () => {
      await Promise.all([result.current.toggle("first"), result.current.toggle("second")]);
    });
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ name: "Liked Songs", isPublic: false })
    );
    expect([...result.current.ids].sort()).toEqual(["first", "second"]);
  });

  it("does not treat a version conflict as a successful favorite", async () => {
    const { result } = await ready();
    state.add.mockRejectedValueOnce(
      new ApiError("Playlist changed concurrently. Refresh and retry.", 409)
    );
    await act(async () => {
      await expect(result.current.toggle("new-favorite")).rejects.toThrow("changed concurrently");
    });
    expect(result.current.ids.has("new-favorite")).toBe(false);
  });

  it("ignores a late mutation from the previous account", async () => {
    stored.set("bob", new Set(["bob-favorite"]));
    const { result } = await ready();
    let finish!: () => void;
    state.add.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.toggle("alice-new");
    });
    await act(async () => {
      state.owner = "bob";
      state.generation++;
      window.dispatchEvent(new Event("spotibuds:session"));
    });
    await waitFor(() => expect(result.current.ids.has("bob-favorite")).toBe(true));
    await act(async () => {
      finish();
      await mutation;
    });
    expect([...result.current.ids]).toEqual(["bob-favorite"]);
    expect(result.current.playlistId).toBe("bob-liked");
    expect(result.current.pending.size).toBe(0);
  });

  it("recovers from a failed initial load without creating a replacement favorites list", async () => {
    state.list.mockRejectedValueOnce(new ApiError("Service unavailable.", 503));
    const { result } = await ready();
    expect(result.current.error).toBe("Service unavailable.");
    await act(async () => result.current.reload());
    expect(result.current.ids.has("old-favorite")).toBe(true);
    expect(result.current.error).toBeNull();
    expect(state.create).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "@/lib/api";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  API_CONFIG: { MUSIC_API: "http://127.0.0.1:5102", USER_API: "http://127.0.0.1:5103" },
  apiRequest: (...args: unknown[]) => request(...args),
}));
import { PlaylistService, PLAYLIST_EVENT } from "@/lib/playlist";
import { ApiError } from "@/lib/request";
const song = (id: string): Song => ({ id, title: id, artists: [], durationSec: 60 });
beforeEach(() => {
  request.mockReset();
});

describe("playlist contracts and album additions", () => {
  it("loads all 100 supported account playlists instead of the default first 50", async () => {
    const all = Array.from({ length: 100 }, (_, index) => ({ id: `playlist-${index}`, songs: [] }));
    request.mockImplementation(async (url: string) => {
      expect(url).toBe("http://127.0.0.1:5102/api/playlists/user/alice?limit=100");
      return all.slice(0, Number(new URL(url).searchParams.get("limit") || 50));
    });
    const lists = await PlaylistService.getUserPlaylists("alice");
    expect(lists).toHaveLength(100);
    expect(lists.at(-1)?.id).toBe("playlist-99");
  });

  it("skips existing and repeated album tracks while adding the rest", async () => {
    request.mockImplementation(async (url: string, options?: RequestInit) =>
      options?.method === "POST" ? undefined : { songs: [song("existing")] }
    );
    expect(
      await PlaylistService.addSongsToPlaylist("list", [
        song("existing"),
        song("new"),
        song("new"),
        song("last"),
      ])
    ).toBe(2);
    expect(
      request.mock.calls
        .filter(([, options]) => options?.method === "POST")
        .map(([url]) => url.split("/").at(-1))
    ).toEqual(["new", "last"]);
  });

  it("continues past a concurrent duplicate but surfaces other 409 conflicts", async () => {
    request.mockImplementation(async (url: string, options?: RequestInit) => {
      if (!options?.method) return { songs: [] };
      if (url.endsWith("/duplicate")) throw new ApiError("Song is already in the playlist.", 409);
      if (url.endsWith("/conflict"))
        throw new ApiError("Playlist changed concurrently. Refresh and retry.", 409);
    });
    await expect(
      PlaylistService.addSongsToPlaylist("list", [
        song("duplicate"),
        song("saved"),
        song("conflict"),
        song("later"),
      ])
    ).rejects.toThrow("1 song was added. Playlist changed concurrently.");
    expect(request.mock.calls.some(([url]) => url.endsWith("/later"))).toBe(false);
  });

  it("reports partial failure and retry adds only the remaining tracks", async () => {
    const stored = new Set<string>();
    let unavailable = true;
    request.mockImplementation(async (url: string, options?: RequestInit) => {
      if (!options?.method) return { songs: [...stored].map(song) };
      const id = url.split("/").at(-1)!;
      if (id === "second" && unavailable) throw new ApiError("Service unavailable.", 503);
      stored.add(id);
    });
    const tracks = [song("first"), song("second"), song("third")];
    await expect(PlaylistService.addSongsToPlaylist("list", tracks)).rejects.toThrow(
      "1 song was added. Service unavailable. Retry to add the remaining songs."
    );
    expect([...stored]).toEqual(["first"]);
    unavailable = false;
    expect(await PlaylistService.addSongsToPlaylist("list", tracks)).toBe(2);
    expect([...stored]).toEqual(["first", "second", "third"]);
    expect(
      request.mock.calls.filter(
        ([url, options]) => options?.method === "POST" && url.endsWith("/first")
      )
    ).toHaveLength(1);
  });

  it("publishes membership changes only after successful writes", async () => {
    const listener = vi.fn();
    window.addEventListener(PLAYLIST_EVENT, listener);
    try {
      request.mockRejectedValueOnce(new ApiError("Service unavailable.", 503));
      await expect(PlaylistService.removeSongFromPlaylist("list", "song")).rejects.toThrow(
        "Service unavailable."
      );
      expect(listener).not.toHaveBeenCalled();
      request.mockResolvedValueOnce(undefined);
      await PlaylistService.removeSongFromPlaylist("list", "song");
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: "list" });
    } finally {
      window.removeEventListener(PLAYLIST_EVENT, listener);
    }
  });
});

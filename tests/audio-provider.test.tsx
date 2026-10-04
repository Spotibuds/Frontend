import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../src/lib/api";

const api = vi.hoisted(() => ({ publish: vi.fn(), clear: vi.fn(), history: vi.fn() }));
vi.mock("../src/lib/session", () => ({
  getSessionUser: () => ({ id: "00000000-0000-4000-8000-000000000001" }),
  SESSION_EVENT: "spotibuds:session",
}));
vi.mock("../src/lib/api", () => ({
  API_CONFIG: { MUSIC_API: "http://127.0.0.1:5102" },
  userApi: {
    setNowPlaying: (...args: unknown[]) => api.publish(...args),
    clearNowPlaying: (...args: unknown[]) => api.clear(...args),
    addToListeningHistory: (...args: unknown[]) => api.history(...args),
  },
}));
import { AudioProvider, useAudio } from "../src/lib/audio";

const song = (id: string, fileUrl: string): Song => ({
  id,
  title: id,
  artists: [{ id: "artist", name: "Canonical artist" }],
  durationSec: 125,
  fileUrl,
});
const valid = song("111111111111111111111111", "http://127.0.0.1:5102/api/media/blob/songs/a.wav");

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  api.publish.mockReset().mockResolvedValue({ success: true });
  api.clear.mockReset().mockResolvedValue({ success: true });
  api.history.mockReset().mockResolvedValue({});
  const playing = new WeakSet<HTMLMediaElement>();
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    return !playing.has(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    playing.add(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    playing.delete(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("unavailable catalogue media", () => {
  it.each(["", " \t"])(
    "stops active playback for a selected track with blank media %j",
    async fileUrl => {
      const { result } = renderHook(() => useAudio(), { wrapper: AudioProvider });
      await act(async () => result.current.playSong(valid));
      expect(result.current.isPlaying).toBe(true);
      expect(api.publish).toHaveBeenCalledWith(expect.objectContaining({ songId: valid.id }));
      api.publish.mockClear();
      api.clear.mockClear();
      const unavailable = song("222222222222222222222222", fileUrl);
      await act(async () => result.current.playSong(unavailable));
      expect(result.current.currentSong?.id).toBe(unavailable.id);
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.state.error).toContain("Playback could not start");
      expect(document.querySelector("audio")?.getAttribute("src")).toBeNull();
      expect(api.publish).not.toHaveBeenCalled();
      expect(api.clear).toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(61_000));
      expect(api.publish).not.toHaveBeenCalled();
      expect(api.history).not.toHaveBeenCalled();
      await act(async () => result.current.togglePlayPause());
      expect(result.current.isPlaying).toBe(false);
      expect(api.publish).not.toHaveBeenCalled();
    }
  );

  it.each(["next", "ended"] as const)(
    "stops at unavailable queued media after %s and can resume a later valid track",
    async transition => {
      const { result } = renderHook(() => useAudio(), { wrapper: AudioProvider });
      await act(async () => result.current.playSong(valid));
      await act(async () => result.current.addToQueue(song("222222222222222222222222", "")));
      api.publish.mockClear();
      await act(async () => {
        if (transition === "next") result.current.nextSong();
        else fireEvent.ended(document.querySelector("audio")!);
      });
      expect(result.current.currentSong?.id).toBe("222222222222222222222222");
      expect(result.current.queue).toEqual([]);
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.state.error).toContain("Playback could not start");
      expect(api.publish).not.toHaveBeenCalled();
      await act(async () => result.current.playSong(valid));
      expect(result.current.isPlaying).toBe(true);
      expect(result.current.state.error).toBeNull();
      expect(api.publish).toHaveBeenCalledWith(expect.objectContaining({ songId: valid.id }));
    }
  );
});

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

const range = (start: number, end: number): TimeRanges => ({
  length: 1,
  start: () => start,
  end: () => end,
});

describe("progressive playback and next-song preload", () => {
  const second = song(
    "222222222222222222222222",
    "http://127.0.0.1:5102/api/media/blob/songs/b.wav"
  );

  it("requests playback immediately and does not restart a waiting or stalled stream", async () => {
    const { result } = renderHook(() => useAudio(), { wrapper: AudioProvider });
    await act(async () => result.current.playSong(valid));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    const audio = document.querySelector("audio")!;
    const calls = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    await act(async () => {
      fireEvent.waiting(audio);
      fireEvent.stalled(audio);
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(calls);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isLoading).toBe(true);
    await act(async () => result.current.togglePlayPause());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("preloads only after current audio has a buffer and promotes the warmed element without reloading", async () => {
    const { result } = renderHook(() => useAudio(), { wrapper: AudioProvider });
    await act(async () => result.current.playPlaylist([valid, second]));
    const [active, standby] = Array.from(document.querySelectorAll("audio"));
    expect(standby.getAttribute("src")).toBeNull();
    vi.spyOn(active, "buffered", "get").mockReturnValue(range(0, 20));
    await act(async () => fireEvent.progress(active));
    expect(result.current.state.bufferedTime).toBe(20);
    expect(standby.getAttribute("src")).toBe(second.fileUrl);
    expect(standby.preload).toBe("metadata");
    expect(standby.muted).toBe(true);
    vi.spyOn(standby, "buffered", "get").mockReturnValue(range(0, 4));
    vi.spyOn(standby, "duration", "get").mockReturnValue(125);
    await act(async () => {
      fireEvent.durationChange(standby);
      fireEvent.waiting(standby);
      fireEvent.ended(standby);
    });
    expect(result.current.currentSong?.id).toBe(valid.id);
    expect(result.current.duration).toBe(0);
    expect(result.current.isLoading).toBe(false);
    vi.spyOn(active, "currentTime", "get").mockReturnValue(121);
    vi.spyOn(active, "buffered", "get").mockReturnValue(range(0, 125));
    await act(async () => fireEvent.timeUpdate(active));
    expect(standby.getAttribute("src")).toBe(second.fileUrl);
    const loads = vi
      .mocked(HTMLMediaElement.prototype.load)
      .mock.contexts.filter(item => item === standby).length;
    await act(async () => fireEvent.ended(active));
    expect(result.current.currentSong?.id).toBe(second.id);
    expect(result.current.duration).toBe(125);
    expect(result.current.state.bufferedTime).toBe(4);
    expect(standby.muted).toBe(false);
    expect(standby.volume).toBe(0.7);
    expect(active.getAttribute("src")).toBeNull();
    expect(
      vi.mocked(HTMLMediaElement.prototype.load).mock.contexts.filter(item => item === standby)
    ).toHaveLength(loads);
  });

  it("keeps the active song playing if preloading fails and releases downloads when unmounted", async () => {
    const { result, unmount } = renderHook(() => useAudio(), { wrapper: AudioProvider });
    await act(async () => result.current.playPlaylist([valid, second]));
    const [active, standby] = Array.from(document.querySelectorAll("audio"));
    vi.spyOn(active, "buffered", "get").mockReturnValue(range(0, 20));
    await act(async () => fireEvent.progress(active));
    await act(async () => fireEvent.error(standby));
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.state.error).toBeNull();
    expect(standby.getAttribute("src")).toBeNull();
    unmount();
    expect(active.getAttribute("src")).toBeNull();
    expect(active.paused).toBe(true);
  });

  it("does not let a rejected play attempt from an old song stop the new song", async () => {
    let reject!: (cause: Error) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(
      () =>
        new Promise((_resolve, failure) => {
          reject = failure;
        })
    );
    const { result } = renderHook(() => useAudio(), { wrapper: AudioProvider });
    await act(async () => result.current.playSong(valid));
    await act(async () => result.current.playSong(second));
    await act(async () => reject(new Error("Old request failed")));
    expect(result.current.currentSong?.id).toBe(second.id);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.state.error).toBeNull();
  });

  it("does not preload on a data-saving connection", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    try {
      const { result } = renderHook(() => useAudio(), { wrapper: AudioProvider });
      await act(async () => result.current.playPlaylist([valid, second]));
      const [active, standby] = Array.from(document.querySelectorAll("audio"));
      vi.spyOn(active, "buffered", "get").mockReturnValue(range(0, 20));
      await act(async () => fireEvent.progress(active));
      expect(standby.getAttribute("src")).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, "connection");
    }
  });
});

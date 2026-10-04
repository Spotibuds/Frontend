import { describe, expect, it } from "vitest";
import { bufferedEnd, nextSongToPreload } from "@/lib/audioBuffer";
import { initialState } from "@/lib/audioState";
import type { Song } from "@/lib/api";

const song = (id: string): Song => ({ id, title: id, artists: [], durationSec: 120 });
describe("buffer and preload selection", () => {
  it("does not count disconnected downloaded ranges as audio buffered ahead", () => {
    const audio = {
      currentTime: 25,
      buffered: { length: 2, start: (i: number) => [0, 90][i], end: (i: number) => [30, 100][i] },
    } as HTMLMediaElement;
    expect(bufferedEnd(audio)).toBe(30);
    audio.currentTime = 50;
    expect(bufferedEnd(audio)).toBe(50);
    audio.currentTime = 95;
    expect(bufferedEnd(audio)).toBe(100);
  });
  it("follows queue priority and skips speculative shuffle or repeating the same track", () => {
    const playlist = [song("first"), song("second")];
    const state = { ...initialState, playlist, currentIndex: 0, currentSong: playlist[0] };
    expect(nextSongToPreload(state)?.id).toBe("second");
    expect(nextSongToPreload({ ...state, queue: [song("queued")], shuffleMode: true })?.id).toBe(
      "queued"
    );
    expect(nextSongToPreload({ ...state, shuffleMode: true })).toBeNull();
    expect(nextSongToPreload({ ...state, repeatMode: "one" })).toBeNull();
    expect(nextSongToPreload({ ...state, currentIndex: 1 })).toBeNull();
    expect(nextSongToPreload({ ...state, currentIndex: 1, repeatMode: "all" })?.id).toBe("first");
  });
});

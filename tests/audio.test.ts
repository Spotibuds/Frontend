import { describe, it, expect } from "vitest";
import { audioReducer, initialState } from "../src/lib/audioState";
import type { Song } from "../src/lib/api";
const song = (id: string): Song => ({ id, title: id, artists: [], durationSec: 10 });
describe("audio navigation", () => {
  it("stops at the final playlist track with repeat off", () => {
    const state = {
      ...initialState,
      playlist: [song("a")],
      currentSong: song("a"),
      currentIndex: 0,
      isPlaying: true,
      duration: 10,
    };
    const ended = audioReducer(state, { type: "ENDED" });
    expect(ended.isPlaying).toBe(false);
    expect(ended.currentSong?.id).toBe("a");
    expect(ended.currentTime).toBe(10);
  });
  it("plays each queued track once, then ends without repeating the first song", () => {
    const state = {
      ...initialState,
      playlist: [song("a")],
      currentSong: song("a"),
      currentIndex: 0,
      isPlaying: true,
      queue: [song("b"), song("c")],
    };
    const second = audioReducer(state, { type: "ENDED" });
    const third = audioReducer(second, { type: "ENDED" });
    const end = audioReducer(third, { type: "ENDED" });
    expect([second.currentSong?.id, third.currentSong?.id]).toEqual(["b", "c"]);
    expect(end.isPlaying).toBe(false);
    expect(end.currentSong?.id).toBe("c");
    expect(end.queue).toEqual([]);
  });
  it("repeat all returns to the first playlist track and previous returns through queued history", () => {
    const state = {
      ...initialState,
      playlist: [song("a"), song("b")],
      currentSong: song("b"),
      currentIndex: 1,
      repeatMode: "all" as const,
      isPlaying: true,
    };
    expect(audioReducer(state, { type: "ENDED" }).currentSong?.id).toBe("a");
    const queued = audioReducer({ ...state, queue: [song("c")] }, { type: "NEXT" });
    expect(audioReducer(queued, { type: "PREVIOUS" }).currentSong?.id).toBe("b");
  });
  it("reset stops playback and clears account-specific queue and history", () => {
    const cleared = audioReducer(
      {
        ...initialState,
        currentSong: song("a"),
        playlist: [song("a")],
        queue: [song("b")],
        playHistory: [song("c")],
        isPlaying: true,
      },
      { type: "RESET" }
    );
    expect(cleared.currentSong).toBeNull();
    expect(cleared.playlist).toEqual([]);
    expect(cleared.queue).toEqual([]);
    expect(cleared.playHistory).toEqual([]);
    expect(cleared.isPlaying).toBe(false);
  });
});

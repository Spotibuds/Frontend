import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "@/lib/api";
import { formatRelativeTime } from "@/lib/relativeTime";

const audio = vi.hoisted(() => ({
  currentSong: null as Song | null,
  isPlaying: false,
  isLoading: false,
  playSong: vi.fn(),
  togglePlayPause: vi.fn(),
}));
vi.mock("@/lib/audio", () => ({ useAudio: () => audio }));
import FeedSongPlayButton from "@/components/feed/FeedSongPlayButton";
import RelativeTime from "@/components/ui/RelativeTime";

const song: Song = {
  id: "track",
  title: "Evening",
  artists: [],
  durationSec: 120,
  fileUrl: "/media/evening.mp3",
};
beforeEach(() => {
  audio.currentSong = null;
  audio.isPlaying = false;
  audio.isLoading = false;
  audio.playSong.mockReset();
  audio.togglePlayPause.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("visible feed playback", () => {
  it("starts the selected song without navigating or bubbling to the feed", () => {
    const parent = vi.fn();
    render(
      <div onClick={parent}>
        <FeedSongPlayButton song={song} title={song.title} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Evening" }));
    expect(audio.playSong).toHaveBeenCalledWith(song);
    expect(parent).not.toHaveBeenCalled();
  });
  it("resumes a paused current song without resetting its position", () => {
    audio.currentSong = song;
    render(<FeedSongPlayButton song={song} title={song.title} />);
    fireEvent.click(screen.getByRole("button", { name: "Play Evening" }));
    expect(audio.togglePlayPause).toHaveBeenCalledOnce();
    expect(audio.playSong).not.toHaveBeenCalled();
  });
  it("can pause the current song while it is buffering", () => {
    audio.currentSong = song;
    audio.isPlaying = true;
    audio.isLoading = true;
    render(<FeedSongPlayButton song={song} title={song.title} />);
    const button = screen.getByRole("button", { name: "Pause Evening" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(audio.togglePlayPause).toHaveBeenCalledOnce();
  });
  it.each([undefined, null, { ...song, fileUrl: " " }])(
    "disables unavailable playback %s",
    value => {
      render(<FeedSongPlayButton song={value} title={song.title} />);
      const button = screen.getByRole("button", { name: "Play Evening" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(audio.playSong).not.toHaveBeenCalled();
    }
  );
});

describe("listening ages", () => {
  const now = Date.parse("2026-10-04T20:00:00Z");
  it.each([
    [0, "just now"],
    [59, "just now"],
    [60, "1 minute ago"],
    [120, "2 minutes ago"],
    [3599, "59 minutes ago"],
    [3600, "1 hour ago"],
    [7200, "2 hours ago"],
    [86400, "1 day ago"],
    [7 * 86400, "1 week ago"],
    [30 * 86400, "1 month ago"],
    [365 * 86400, "1 year ago"],
  ])("formats %s seconds accurately", (seconds, label) => {
    expect(formatRelativeTime(new Date(now - Number(seconds) * 1000).toISOString(), now)).toBe(
      label
    );
  });
  it("omits invalid timestamps and treats clock skew as just now", () => {
    expect(formatRelativeTime("invalid", now)).toBeNull();
    expect(formatRelativeTime("2026-10-04T20:00:02Z", now)).toBe("just now");
    render(<RelativeTime value="invalid" prefix="Listened " />);
    expect(screen.queryByText(/Listened/)).toBeNull();
  });
  it("updates an open card and retains its exact UTC timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    render(<RelativeTime value="2026-10-04T19:59:30Z" prefix="Listened " />);
    expect(screen.getByText("Listened just now").getAttribute("dateTime")).toBe(
      "2026-10-04T19:59:30.000Z"
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Listened 1 minute ago").getAttribute("title")).toContain(
      "19:59:30.000 UTC"
    );
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});

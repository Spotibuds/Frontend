import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Album, Song } from "@/lib/api";
import type { Playlist, PlaylistSong } from "@/lib/playlist";

const fixture = vi.hoisted(() => ({
  playlist: [] as Song[],
  currentSong: null as Song | null,
  isPlaying: false,
  play: vi.fn(),
  toggle: vi.fn(),
  queue: vi.fn(),
  detail: vi.fn(),
  albumSongs: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "selected" }) }));
vi.mock("@/lib/audio", () => ({
  useAudio: () => ({
    playlist: fixture.playlist,
    currentSong: fixture.currentSong,
    isPlaying: fixture.isPlaying,
    playPlaylist: fixture.play,
    togglePlayPause: fixture.toggle,
    addToQueue: fixture.queue,
    formatTime: (seconds: number) => `${seconds}s`,
  }),
}));
vi.mock("@/lib/api", () => ({
  identityApi: { getCurrentUser: () => ({ id: "alice" }) },
  musicApi: { getAlbumSongs: (...args: unknown[]) => fixture.albumSongs(...args) },
  safeString: (value: unknown) => String(value),
  processArtists: () => ["Artist"],
}));
vi.mock("@/lib/playlist", () => ({
  PLAYLIST_EVENT: "spotibuds:playlist-changed",
  PlaylistService: {
    getPlaylist: (...args: unknown[]) => fixture.detail(...args),
    addSongToPlaylist: (...args: unknown[]) => fixture.add(...args),
    removeSongFromPlaylist: (...args: unknown[]) => fixture.remove(...args),
    reorderSongs: (...args: unknown[]) => fixture.reorder(...args),
  },
}));
vi.mock("@/components/ui/MusicImage", () => ({ default: () => null }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => null }));
vi.mock("@/components/PlaylistCoverUploader", () => ({ default: () => null }));
vi.mock("@/components/AddToPlaylist", () => ({ default: () => null }));
import PlaylistDetailPage from "@/app/playlists/[id]/page";
import AlbumPlayButton from "@/components/ui/AlbumPlayButton";
import { ApiError } from "@/lib/request";

const song = (id: string): PlaylistSong => ({
  id,
  title: id,
  artists: [],
  durationSec: 60,
  album: { id: "album", title: "Selected album" },
  position: 0,
  addedAt: "2026-10-04",
});
const tracks = [song("Shared"), song("Selected second")];
const album: Album = {
  id: "album",
  title: "Selected album",
  songs: tracks.map(({ id, addedAt }, position) => ({ id, addedAt, position })),
  createdAt: "2026-10-04",
};
const list = (songs: PlaylistSong[] = tracks): Playlist => ({
  id: "selected",
  name: "Selected playlist",
  createdBy: "alice",
  songs,
  createdAt: "2026-10-04",
  updatedAt: "2026-10-04",
});
beforeEach(() => {
  fixture.playlist = [];
  fixture.currentSong = null;
  fixture.isPlaying = false;
  fixture.play.mockReset();
  fixture.toggle.mockReset();
  fixture.queue.mockReset();
  fixture.detail.mockReset().mockImplementation(async () => list());
  fixture.albumSongs.mockReset().mockResolvedValue(tracks);
  fixture.add.mockReset().mockResolvedValue(undefined);
  fixture.remove.mockReset().mockResolvedValue(undefined);
  fixture.reorder.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("playlist listening controls", () => {
  it("plays the selected full playlist when another context only shares one song", async () => {
    fixture.playlist = [tracks[0], song("Other second")];
    fixture.currentSong = tracks[0];
    fixture.isPlaying = true;
    render(<PlaylistDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(fixture.play).toHaveBeenCalledWith(tracks, 0);
    expect(fixture.toggle).not.toHaveBeenCalled();
  });

  it("resumes the matching paused playlist rather than resetting progress", async () => {
    fixture.playlist = tracks;
    fixture.currentSong = tracks[1];
    render(<PlaylistDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(fixture.toggle).toHaveBeenCalledTimes(1);
    expect(fixture.play).not.toHaveBeenCalled();
  });

  it("resumes a selected current-song row and starts another row at its index", async () => {
    fixture.playlist = tracks;
    fixture.currentSong = tracks[1];
    render(<PlaylistDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Listen to Selected second" }));
    expect(fixture.toggle).toHaveBeenCalledTimes(1);
    expect(fixture.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Listen to Shared" }));
    expect(fixture.play).toHaveBeenCalledWith(tracks, 0);
  });

  it("keeps differing track order as a distinct listening context", async () => {
    fixture.playlist = [...tracks].reverse();
    fixture.currentSong = tracks[0];
    fixture.isPlaying = true;
    render(<PlaylistDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(fixture.play).toHaveBeenCalledWith(tracks, 0);
    expect(fixture.toggle).not.toHaveBeenCalled();
  });

  it("retries removal undo when adding succeeded but restoring the order failed", async () => {
    let stored = [...tracks];
    fixture.detail.mockImplementation(async () => list([...stored]));
    fixture.remove.mockImplementation(async (_list: string, id: string) => {
      stored = stored.filter(track => track.id !== id);
    });
    fixture.add.mockImplementation(async (_list: string, id: string) => {
      if (stored.some(track => track.id === id))
        throw new ApiError("Song is already in the playlist.", 409);
      stored.push(tracks.find(track => track.id === id)!);
    });
    fixture.reorder
      .mockRejectedValueOnce(new ApiError("Playlist changed concurrently. Refresh and retry.", 409))
      .mockImplementation(async (_list: string, ids: string[]) => {
        stored = ids.map(id => stored.find(track => track.id === id)!);
      });
    render(<PlaylistDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Shared from playlist" }));
    const undo = await screen.findByRole("button", { name: "Undo removal" });
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);
    await screen.findByText(/Playlist changed concurrently/);
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);
    await screen.findByText("Song restored.");
    expect(stored.map(track => track.id)).toEqual(tracks.map(track => track.id));
    expect(fixture.reorder).toHaveBeenCalledTimes(2);
  });
});

describe("album listening controls", () => {
  it("resumes the matching paused album instead of restarting", async () => {
    fixture.playlist = tracks;
    fixture.currentSong = tracks[1];
    render(<AlbumPlayButton album={album} />);
    fireEvent.click(screen.getByRole("button", { name: "Play Selected album" }));
    await waitFor(() => expect(fixture.toggle).toHaveBeenCalledTimes(1));
    expect(fixture.play).not.toHaveBeenCalled();
  });

  it("starts the complete album when the playing track comes from a different context", async () => {
    fixture.playlist = [tracks[0], song("Unrelated")];
    fixture.currentSong = tracks[0];
    fixture.isPlaying = true;
    render(<AlbumPlayButton album={album} />);
    fireEvent.click(screen.getByRole("button", { name: "Play Selected album" }));
    await waitFor(() => expect(fixture.play).toHaveBeenCalledWith(tracks));
    expect(fixture.toggle).not.toHaveBeenCalled();
  });

  it("keeps playback unchanged on album fetch failure and supports retry", async () => {
    fixture.albumSongs.mockRejectedValueOnce(new Error("Music unavailable. Retry."));
    render(<AlbumPlayButton album={album} />);
    fireEvent.click(screen.getByRole("button", { name: "Play Selected album" }));
    await screen.findByRole("alert");
    expect(fixture.play).not.toHaveBeenCalled();
    expect(fixture.toggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play Selected album" }));
    await waitFor(() => expect(fixture.play).toHaveBeenCalledWith(tracks));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("labels a matching active album control Pause and toggles playback", async () => {
    fixture.playlist = tracks;
    fixture.currentSong = tracks[1];
    fixture.isPlaying = true;
    render(<AlbumPlayButton album={album} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause Selected album" }));
    await waitFor(() => expect(fixture.toggle).toHaveBeenCalledTimes(1));
    expect(fixture.play).not.toHaveBeenCalled();
  });
});

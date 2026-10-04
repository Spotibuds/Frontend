import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  artist: vi.fn(),
  albums: vi.fn(),
  songs: vi.fn(),
  route: "artist",
  state: {
    currentSong: {
      id: "song",
      title: "Evening",
      artists: [
        { id: "artist", name: "Performer" },
        { id: "guest", name: "Guest" },
      ],
      album: { id: "album", title: "Night" },
      durationSec: 120,
    },
    repeatMode: "off",
    shuffleMode: false,
    currentTime: 15,
    duration: 120,
    bufferedTime: 30,
    isPlaying: false,
    isLoading: false,
    isMuted: false,
    volume: 0.5,
    queue: [],
  },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: fixture.route }) }));
vi.mock("@/lib/api", () => ({
  musicApi: {
    getArtist: fixture.artist,
    getArtistAlbums: fixture.albums,
    getArtistSongs: fixture.songs,
  },
  safeString: (value: unknown) => String(value || ""),
  processArtists: (artists: { name: string }[]) => artists.map(artist => artist.name),
}));
vi.mock("@/lib/audio", () => ({
  useAudio: () => ({ state: fixture.state, formatTime: (seconds: number) => `${seconds}s` }),
}));
vi.mock("@/components/ui/MusicImage", () => ({ default: () => null }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => null }));
vi.mock("@/components/SongCard", () => ({ default: () => null }));
vi.mock("@/components/ui/AlbumPlayButton", () => ({ default: () => null }));
import MusicPlayer from "@/components/MusicPlayer";
import ArtistPage from "@/app/artist/[id]/page";
beforeEach(() => {
  fixture.route = "artist";
  fixture.artist.mockReset().mockResolvedValue({ id: "artist", name: "Performer" });
  fixture.albums.mockReset().mockResolvedValue([]);
  fixture.songs.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);
describe("listening navigation", () => {
  it("opens album and every credited artist from the persistent player", () => {
    render(<MusicPlayer />);
    expect(screen.getByRole("link", { name: "Evening" }).getAttribute("href")).toBe("/album/album");
    expect(screen.getByRole("link", { name: "Performer" }).getAttribute("href")).toBe(
      "/artist/artist"
    );
    expect(screen.getByRole("link", { name: "Guest" }).getAttribute("href")).toBe("/artist/guest");
    fireEvent.click(screen.getByRole("button", { name: "Open music player" }));
    expect(screen.getByRole("link", { name: "View album: Night" }).getAttribute("href")).toBe(
      "/album/album"
    );
    expect(screen.getByRole("link", { name: "Guest" }).getAttribute("href")).toBe("/artist/guest");
  });
  it("shows the artist before slow albums and songs complete", async () => {
    let finish!: (albums: unknown[]) => void;
    fixture.albums.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    render(<ArtistPage />);
    await screen.findByRole("heading", { name: "Performer" });
    expect(fixture.songs).toHaveBeenCalledOnce();
    expect(screen.getByText("Loading albums and songs…")).toBeTruthy();
    await act(async () => finish([]));
  });
});

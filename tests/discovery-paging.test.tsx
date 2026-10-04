import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const catalogue = vi.hoisted(() => ({ songs: vi.fn(), albums: vi.fn(), artists: vi.fn() }));
vi.mock("@/lib/api", () => ({
  musicApi: {
    getSongs: catalogue.songs,
    getAlbums: catalogue.albums,
    getArtists: catalogue.artists,
  },
  identityApi: { getCurrentUser: () => null },
}));
vi.mock("@/contexts/FavoritesContext", () => ({ useFavorites: () => ({ playlistId: null }) }));
vi.mock("@/components/SongCard", () => ({
  default: ({ song }: { song: { title: string } }) => <article>{song.title}</article>,
}));
vi.mock("@/components/ui/MusicImage", () => ({ default: () => null }));
vi.mock("@/components/ui/AlbumPlayButton", () => ({ default: () => null }));
import MusicDiscovery from "@/components/MusicDiscovery";
const rows = Array.from({ length: 183 }, (_, index) => ({
  id: String(index),
  title: `Song ${index}`,
}));
afterEach(cleanup);
beforeEach(() => {
  catalogue.songs
    .mockReset()
    .mockImplementation(async (limit: number, skip = 0) => rows.slice(skip, skip + limit));
  catalogue.albums.mockReset().mockResolvedValue([]);
  catalogue.artists.mockReset().mockResolvedValue([]);
});
describe("public catalogue paging", () => {
  it("loads every song progressively without duplicate rows", async () => {
    render(<MusicDiscovery />);
    await screen.findByText("Song 49");
    for (const last of [99, 149, 182]) {
      fireEvent.click(screen.getByRole("button", { name: "Load more songs" }));
      await screen.findByText(`Song ${last}`);
    }
    expect(screen.getAllByRole("article")).toHaveLength(183);
    expect(screen.queryByRole("button", { name: "Load more songs" })).toBeNull();
    expect(catalogue.songs.mock.calls).toEqual([[50], [50, 50], [50, 100], [50, 150]]);
  });
  it("retains loaded songs and retries the same offset after failure", async () => {
    render(<MusicDiscovery />);
    await screen.findByText("Song 49");
    catalogue.songs.mockRejectedValueOnce(new Error("Unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Load more songs" }));
    await screen.findByRole("alert");
    expect(screen.getAllByRole("article")).toHaveLength(50);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Load more songs" }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more songs" }));
    await screen.findByText("Song 99");
    expect(catalogue.songs.mock.calls.slice(-2)).toEqual([
      [50, 50],
      [50, 50],
    ]);
  });
});

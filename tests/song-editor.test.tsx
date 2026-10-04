import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "@/lib/api";
const edit = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/api", () => ({
  musicApi: { getArtists: async () => [], getAlbums: async () => [] },
}));
vi.mock("@/components/ui/MusicImage", () => ({ default: () => null }));
import UpdateModal from "@/components/UpdateModal";
const song: Song = {
  id: "track",
  title: "Single",
  artists: [
    { id: "primary", name: "Primary" },
    { id: "guest", name: "Guest" },
  ],
  durationSec: 120,
};
beforeEach(() => edit.save.mockReset().mockResolvedValue(song));
afterEach(cleanup);
describe("song metadata editing", () => {
  it("saves a single without an album and preserves existing guest credits", async () => {
    render(<UpdateModal type="song" data={song} isOpen onClose={() => {}} onUpdate={edit.save} />);
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "Renamed single" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(edit.save).toHaveBeenCalledOnce());
    const body = edit.save.mock.calls[0][2] as FormData;
    expect(body.get("Title")).toBe("Renamed single");
    expect(body.has("ArtistId")).toBe(false);
    expect(body.get("AlbumId")).toBe("");
  });
  it("sends explicit album clearing rather than silently retaining the previous album", async () => {
    render(
      <UpdateModal
        type="song"
        data={{ ...song, album: { id: "album", title: "Old album" } }}
        isOpen
        onClose={() => {}}
        onUpdate={edit.save}
      />
    );
    await waitFor(() =>
      expect((screen.getByLabelText("albumQuery") as HTMLInputElement).value).toBe("Old album")
    );
    fireEvent.change(screen.getByLabelText("albumQuery"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(edit.save).toHaveBeenCalledOnce());
    expect((edit.save.mock.calls[0][2] as FormData).get("AlbumId")).toBe("");
  });
});

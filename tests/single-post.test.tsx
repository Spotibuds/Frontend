import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePostRouteId, type FeedPost } from "../src/lib/feedTypes";
const fixture = vi.hoisted(() => ({
  id: "",
  generation: 0,
  owner: "00000000-0000-4000-8000-000000000001" as string | null,
  get: vi.fn(),
  summary: vi.fn(),
  people: vi.fn(),
  song: vi.fn(),
  play: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: fixture.id }),
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("../src/lib/session", () => ({
  getSessionGeneration: () => fixture.generation,
  getSessionUser: () => (fixture.owner ? { id: fixture.owner } : null),
  SESSION_EVENT: "spotibuds:session",
}));
vi.mock("../src/lib/api", () => ({
  identityApi: {
    getCurrentUser: () => (fixture.owner ? { id: fixture.owner, username: "Alice" } : null),
  },
  userApi: {
    getPostById: (...args: unknown[]) => fixture.get(...args),
    getReactionsByPost: async () => [],
    getFeedReactionSummary: (...args: unknown[]) => fixture.summary(...args),
    getFeedReactionPeople: (...args: unknown[]) => fixture.people(...args),
    getUserProfileByIdentityId: async () => ({
      id: "00000000-0000-4000-8000-000000000002",
      username: "Bob",
    }),
  },
  musicApi: {
    getArtists: async () => [],
    getSong: (...args: unknown[]) => fixture.song(...args),
  },
}));
vi.mock("../src/lib/audio", () => ({ useAudio: () => ({ playSong: fixture.play }) }));
vi.mock("../src/components/ui/MusicImage", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
import SinglePostPage from "../src/app/feed/post/[id]/page";
const author = "00000000-0000-4000-8000-000000000002";
const virtual = `nowplaying:${author}:000000000000000000000001`;
const post = (id = virtual, type = "now_playing"): FeedPost => ({
  postId: id,
  type,
  identityUserId: author,
  username: "Bob",
  songId: "000000000000000000000001",
  songTitle: "Morning Loop",
  artist: "Local Artist",
});
afterEach(cleanup);
beforeEach(() => {
  fixture.id = virtual;
  fixture.generation = 0;
  fixture.owner = "00000000-0000-4000-8000-000000000001";
  fixture.song.mockReset().mockResolvedValue({
    id: "000000000000000000000001",
    title: "Morning Loop",
    artists: [],
    fileUrl: "http://127.0.0.1:5102/api/media/blob/audio/fixture.wav",
  });
  fixture.play.mockReset();
  fixture.summary
    .mockReset()
    .mockResolvedValue({ postId: virtual, total: 0, counts: [], myEmojis: [] });
  fixture.people
    .mockReset()
    .mockResolvedValue({ items: [], total: 0, nextCursor: null, hasMore: false });
  fixture.get.mockReset().mockImplementation(async (id: string) => {
    if (id.includes("%")) throw new Error("Invalid post identifier");
    return post(id);
  });
});
describe("notification single-post destinations", () => {
  it("passes encoded virtual route parameters to the API as one canonical identifier", async () => {
    fixture.id = encodeURIComponent(virtual);
    render(<SinglePostPage />);
    await waitFor(() => expect(fixture.get).toHaveBeenCalledWith(virtual, fixture.owner));
  });
  it("renders the supported now-playing song context at the destination", async () => {
    render(<SinglePostPage />);
    expect(await screen.findByRole("heading", { name: "Morning Loop" })).toBeTruthy();
  });

  it.each(
    [
      { kind: "empty", fileUrl: "" },
      { kind: "whitespace", fileUrl: " \t " },
      { kind: "missing", fileUrl: undefined },
    ].flatMap(value =>
      ["recent_song", "now_playing", "top_songs_week"].map(type => ({ ...value, type }))
    )
  )("retains detail $type content but disables $kind audio playback", async ({ type, fileUrl }) => {
    fixture.get.mockResolvedValue({
      ...post(virtual, type),
      ...(type === "top_songs_week"
        ? {
            topSongs: [{ songId: "000000000000000000000001", songTitle: "Morning Loop", count: 3 }],
          }
        : {}),
    });
    fixture.song.mockResolvedValue({
      id: "000000000000000000000001",
      title: "   ",
      artists: [],
      fileUrl,
    });
    render(<SinglePostPage />);
    await screen.findByText("Playback unavailable. The post remains available.");
    const button = screen.getByRole("button", { name: "Play Morning Loop" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Morning Loop")).toBeTruthy();
    fireEvent.click(button);
    expect(fixture.play).not.toHaveBeenCalled();
  });
  it("handles already-decoded weekly/common identifiers and rejects malformed segments", () => {
    const weekly = `weekly:artists:${author}:20261004`;
    const common = `common:${fixture.owner}:${author}:20261004`;
    expect(decodePostRouteId(weekly)).toBe(weekly);
    expect(decodePostRouteId(encodeURIComponent(common))).toBe(common);
    expect(decodePostRouteId("%ZZ")).toBeNull();
    expect(decodePostRouteId("%00")).toBeNull();
    expect(decodePostRouteId([weekly])).toBeNull();
  });
  it("does not allow delayed old post content to replace the new destination", async () => {
    let resolve!: (value: FeedPost) => void;
    fixture.get.mockImplementation((id: string) =>
      id === virtual
        ? new Promise(done => {
            resolve = done;
          })
        : Promise.resolve({ ...post(id, "recent_song"), songTitle: "New Destination" })
    );
    const view = render(<SinglePostPage />);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    fixture.id = "000000000000000000000003";
    view.rerender(<SinglePostPage />);
    await screen.findByRole("heading", { name: "New Destination" });
    await act(async () => resolve(post()));
    expect(screen.queryByRole("heading", { name: "Morning Loop" })).toBeNull();
    expect(screen.getByRole("heading", { name: "New Destination" })).toBeTruthy();
  });

  it("clears already rendered owned content on a same-route logout and ignores delayed reaction state", async () => {
    let resolve!: (value: unknown) => void;
    fixture.summary.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    render(<SinglePostPage />);
    await screen.findByRole("heading", { name: "Morning Loop" });
    fixture.owner = null;
    fixture.generation++;
    act(() => window.dispatchEvent(new CustomEvent("spotibuds:session")));
    expect(screen.queryByRole("heading", { name: "Morning Loop" })).toBeNull();
    expect(screen.getByText("Please log in to view posts.")).toBeTruthy();
    await act(async () =>
      resolve({ postId: virtual, total: 120, counts: [{ emoji: "❤️", count: 120 }], myEmojis: [] })
    );
    expect(screen.queryByText("120 reactions")).toBeNull();
  });

  it("uses exact canonical totals independently of the bounded people page", async () => {
    fixture.summary.mockResolvedValue({
      postId: virtual,
      total: 125,
      counts: [{ emoji: "❤️", count: 125 }],
      myEmojis: [],
    });
    render(<SinglePostPage />);
    await screen.findByText("125 reactions");
    fireEvent.click(screen.getByRole("button", { name: "View reactions" }));
    expect(await screen.findByRole("dialog", { name: "Reactions" })).toBeTruthy();
    expect(fixture.people).toHaveBeenCalledTimes(1);
    expect(fixture.summary).toHaveBeenCalledTimes(1);
  });

  it("shows and retries a reaction read failure without claiming an empty reaction set", async () => {
    fixture.summary
      .mockRejectedValueOnce(new Error("Reaction service unavailable"))
      .mockResolvedValueOnce({ postId: virtual, total: 0, counts: [], myEmojis: [] });
    render(<SinglePostPage />);
    await screen.findByText("Reaction service unavailable");
    expect(screen.queryByText("No reactions yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload reactions" }));
    await screen.findByText("No reactions yet");
    expect(fixture.summary).toHaveBeenCalledTimes(2);
  });
});

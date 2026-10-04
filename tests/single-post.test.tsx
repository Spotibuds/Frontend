import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePostRouteId, type FeedPost } from "../src/lib/feedTypes";
const fixture = vi.hoisted(() => ({
  id: "",
  generation: 0,
  owner: "00000000-0000-4000-8000-000000000001",
  get: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: fixture.id }),
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("../src/lib/session", () => ({
  getSessionGeneration: () => fixture.generation,
  getSessionUser: () => ({ id: fixture.owner }),
}));
vi.mock("../src/lib/api", () => ({
  identityApi: { getCurrentUser: () => ({ id: fixture.owner, username: "Alice" }) },
  userApi: {
    getPostById: (...args: unknown[]) => fixture.get(...args),
    getReactionsByPost: async () => [],
    getUserProfileByIdentityId: async () => ({
      id: "00000000-0000-4000-8000-000000000002",
      username: "Bob",
    }),
  },
  musicApi: {
    getArtists: async () => [],
    getSong: async () => ({ id: "000000000000000000000001", title: "Morning Loop", artists: [] }),
  },
}));
vi.mock("../src/lib/audio", () => ({ useAudio: () => ({ playSong: vi.fn() }) }));
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
});

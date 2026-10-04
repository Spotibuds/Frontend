import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactionCache } from "../src/lib/reactionCache";

const fixture = vi.hoisted(() => ({
  owner: "00000000-0000-4000-8000-000000000001" as string | null,
  generation: 0,
  query: "",
  slides: vi.fn(),
  reactions: vi.fn(),
  send: vi.fn(),
  profile: vi.fn(),
  song: vi.fn(),
  play: vi.fn(),
  people: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(fixture.query) }));
vi.mock("../src/lib/session", () => ({
  getSessionGeneration: () => fixture.generation,
  getSessionUser: () => (fixture.owner ? { id: fixture.owner, username: "Alice" } : null),
  SESSION_EVENT: "spotibuds:session",
}));
vi.mock("../src/lib/api", () => ({
  identityApi: {
    getCurrentUser: () => (fixture.owner ? { id: fixture.owner, username: "Alice" } : null),
  },
  userApi: {
    getFeedSlides: (...args: unknown[]) => fixture.slides(...args),
    getFeedPage: async (...args: unknown[]) => {
      const result = await fixture.slides(...args);
      return Array.isArray(result) ? { items: result, nextCursor: null, hasMore: false } : result;
    },
    getFeedReactionSummary: async (postId: string) => {
      const value = await fixture.reactions(postId);
      if (!Array.isArray(value)) return value;
      const counts: Record<string, number> = {};
      value.forEach(item => {
        counts[item.emoji] = (counts[item.emoji] || 0) + 1;
      });
      return {
        postId,
        total: value.length,
        counts: Object.entries(counts).map(([emoji, count]) => ({ emoji, count })),
        myEmojis: value
          .filter(item => item.fromIdentityUserId === fixture.owner)
          .map(item => item.emoji),
      };
    },
    getFeedReactionPeople: (...args: unknown[]) => fixture.people(...args),
    getReactionsByPost: (...args: unknown[]) => fixture.reactions(...args),
    sendReaction: (...args: unknown[]) => fixture.send(...args),
    getUserProfileByIdentityId: (...args: unknown[]) => fixture.profile(...args),
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
import FeedPage from "../src/app/feed/page";
import { useFeed, readFeedSeen } from "../src/hooks/useFeed";
import { feedSlideKey, chunkedShuffle, declumpAuthors } from "../src/lib/feedState";
import { ReactionSummaryView } from "../src/components/feed/FeedCards";

const author = "00000000-0000-4000-8000-000000000002";
const songId = "000000000000000000000001";
const slide = (postId = "000000000000000000000010", type = "recent_song") => ({
  postId,
  type,
  identityUserId: author,
  username: "Bob",
  songId,
  songTitle: "Morning Loop",
  artist: "Local Artist",
});
const reaction = {
  emoji: "❤️",
  fromIdentityUserId: author,
  toIdentityUserId: author,
  fromUserName: "Bob",
  createdAt: "2026-10-04T00:00:00Z",
};
const observers: Array<{ callback: IntersectionObserverCallback; elements: Element[] }> = [];
class Observer {
  elements: Element[] = [];
  constructor(callback: IntersectionObserverCallback) {
    observers.push({ callback, elements: this.elements });
  }
  observe(element: Element) {
    this.elements.push(element);
  }
  unobserve() {}
  disconnect() {}
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  fixture.owner = "00000000-0000-4000-8000-000000000001";
  fixture.generation = 0;
  fixture.query = "";
  fixture.slides
    .mockReset()
    .mockImplementation(async (_owner: string, _limit: number, skip: number) =>
      skip ? [] : [slide()]
    );
  fixture.reactions.mockReset().mockResolvedValue([]);
  fixture.send.mockReset().mockResolvedValue({ success: true, action: "added" });
  fixture.profile.mockReset().mockResolvedValue({ username: "Bob" });
  fixture.song.mockReset().mockResolvedValue({
    id: songId,
    title: "Morning Loop",
    artists: [],
    fileUrl: "http://127.0.0.1:5102/api/media/blob/audio/fixture.wav",
  });
  fixture.play.mockReset();
  fixture.people
    .mockReset()
    .mockResolvedValue({ items: [reaction], nextCursor: null, hasMore: false, total: 1 });
  reactionCache.clear();
  localStorage.clear();
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", Observer);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("feed reliability", () => {
  it("does not start deep-link paging for an ordinary feed visit", async () => {
    render(<FeedPage />);
    await screen.findByText("Morning Loop");
    await waitFor(() => expect(fixture.profile).toHaveBeenCalled());
    expect(fixture.slides).toHaveBeenCalledTimes(1);
  });

  it("preloads a standalone now-playing card so Play works", async () => {
    fixture.slides.mockResolvedValue([slide(`nowplaying:${author}:${songId}`, "now_playing")]);
    render(<FeedPage />);
    await screen.findByText("Morning Loop");
    await waitFor(() => expect(fixture.song).toHaveBeenCalledWith(songId));
    fireEvent.click(screen.getByTitle("Play"));
    expect(fixture.play).toHaveBeenCalledTimes(1);
  });

  it("does not offer an Add mutation when reaction state failed to load", async () => {
    fixture.reactions.mockRejectedValue(new Error("Reactions unavailable"));
    render(<FeedPage />);
    await screen.findByText("Reactions unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Add ❤️ reaction" }));
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("keeps an opened reaction dialog across unrelated profile enrichment", async () => {
    const profile = deferred<{ username: string }>();
    fixture.profile.mockReturnValue(profile.promise);
    fixture.reactions.mockResolvedValue([reaction]);
    render(<FeedPage />);
    fireEvent.click(await screen.findByRole("button", { name: "View reactions" }));
    expect(screen.getByRole("dialog", { name: "Reactions" })).toBeTruthy();
    await act(async () => profile.resolve({ username: "Bob" }));
    expect(screen.getByRole("dialog", { name: "Reactions" })).toBeTruthy();
  });

  it("ignores a prior-account feed response after logout", async () => {
    const initial = deferred<ReturnType<typeof slide>[]>();
    fixture.slides.mockReturnValue(initial.promise);
    const view = render(<FeedPage />);
    await waitFor(() => expect(fixture.slides).toHaveBeenCalled());
    fixture.owner = null;
    fixture.generation++;
    act(() => window.dispatchEvent(new CustomEvent("spotibuds:session")));
    view.rerender(<FeedPage />);
    await act(async () => initial.resolve([slide()]));
    expect(screen.queryByText("Morning Loop")).toBeNull();
    expect(screen.getByText("Please log in to see your feed.")).toBeTruthy();
  });

  it("shares one synchronous in-flight continuation between competing load triggers", async () => {
    const next = deferred<unknown>();
    fixture.slides.mockImplementation(async (_id: string, _limit: number, cursor: string | null) =>
      cursor ? next.promise : { items: [slide()], nextCursor: "cursor-1", hasMore: true }
    );
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.slides.length).toBe(1));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = view.result.current.load();
      second = view.result.current.load();
    });
    expect(first).toBe(second);
    expect(fixture.slides).toHaveBeenCalledTimes(2);
    await act(async () =>
      next.resolve({
        items: [{ ...slide("000000000000000000000011"), songTitle: "Second track" }],
        nextCursor: null,
        hasMore: false,
      })
    );
    expect(view.result.current.slides.map(item => item.postId)).toEqual([
      slide().postId,
      "000000000000000000000011",
    ]);
  });

  it("advances empty continuing pages within a bounded scan and retains manual continuation", async () => {
    fixture.slides.mockImplementation(
      async (_id: string, _limit: number, cursor: string | null) => ({
        items: [],
        nextCursor: `${cursor || ""}x`,
        hasMore: true,
      })
    );
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.scanPaused).toBe(true));
    expect(fixture.slides).toHaveBeenCalledTimes(3);
    expect(view.result.current.hasMore).toBe(true);
    expect(view.result.current.slides).toEqual([]);
    await act(async () => {
      await view.result.current.load();
    });
    expect(fixture.slides).toHaveBeenCalledTimes(6);
    expect(fixture.slides.mock.calls[3][2]).toBe("xxx");
  });

  it("retains existing posts and the cursor after a load-more failure, then retries that page", async () => {
    fixture.slides
      .mockResolvedValueOnce({ items: [slide()], nextCursor: "next", hasMore: true })
      .mockRejectedValueOnce(new Error("User unavailable"))
      .mockResolvedValueOnce({
        items: [{ ...slide("000000000000000000000012"), songTitle: "Recovered track" }],
        nextCursor: null,
        hasMore: false,
      });
    render(<FeedPage />);
    await screen.findByText("Morning Loop");
    fireEvent.click(screen.getByRole("button", { name: "Load more posts" }));
    await screen.findByText("User unavailable");
    expect(screen.getByText("Morning Loop")).toBeTruthy();
    expect(screen.queryByText(/No public listening activity/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading feed" }));
    await screen.findByText("Recovered track");
    expect(fixture.slides.mock.calls.slice(1).map(args => args[2])).toEqual(["next", "next"]);
  });

  it("retains a failed refresh and retries from the head without duplicating the retained feed", async () => {
    fixture.slides
      .mockResolvedValueOnce({ items: [slide()], nextCursor: "next", hasMore: true })
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce({ items: [slide()], nextCursor: null, hasMore: false });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.slides.length).toBe(1));
    await act(async () => {
      await view.result.current.load(true);
    });
    expect(view.result.current.slides.length).toBe(1);
    expect(view.result.current.error).toBe("Refresh unavailable");
    await act(async () => {
      await view.result.current.retryLoad();
    });
    expect(view.result.current.slides.length).toBe(1);
    expect(fixture.slides.mock.calls.map(args => args[2])).toEqual([null, null, null]);
  });

  it("rejects a stalled continuation instead of repeatedly requesting the same cursor", async () => {
    fixture.slides
      .mockResolvedValueOnce({ items: [slide()], nextCursor: "same", hasMore: true })
      .mockResolvedValueOnce({ items: [], nextCursor: "same", hasMore: true });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.slides.length).toBe(1));
    await act(async () => {
      await view.result.current.load();
    });
    expect(view.result.current.error).toContain("continuation");
    expect(view.result.current.slides.length).toBe(1);
    expect(fixture.slides).toHaveBeenCalledTimes(2);
  });

  it("ignores a pre-refresh enrichment response and keeps the current snapshot", async () => {
    const old = deferred<{ username: string }>();
    fixture.profile.mockReturnValueOnce(old.promise).mockResolvedValue({ username: "Current Bob" });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(fixture.profile).toHaveBeenCalledTimes(1));
    await act(async () => {
      await view.result.current.load(true);
    });
    await waitFor(() => expect(view.result.current.profiles[author]?.username).toBe("Current Bob"));
    await act(async () => old.resolve({ username: "Old Bob" }));
    expect(view.result.current.profiles[author]?.username).toBe("Current Bob");
  });

  it("uses the authoritative toggle action and resynchronizes before allowing another mutation", async () => {
    const after = deferred<unknown>();
    fixture.reactions.mockResolvedValueOnce([]).mockReturnValueOnce(after.promise);
    fixture.send.mockResolvedValue({ action: "removed", postId: slide().postId, success: true });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.reactions[slide().postId]?.ready).toBe(true));
    let mutation!: Promise<void>;
    act(() => {
      mutation = view.result.current.react(slide() as never, "❤️");
    });
    await waitFor(() => expect(fixture.reactions).toHaveBeenCalledTimes(2));
    expect(view.result.current.reactions[slide().postId].summary?.myEmojis).toEqual([]);
    expect(view.result.current.reactions[slide().postId].ready).toBe(false);
    await act(async () => {
      await view.result.current.react(slide() as never, "❤️");
    });
    expect(fixture.send).toHaveBeenCalledTimes(1);
    await act(async () => {
      after.resolve([]);
      await mutation;
    });
    expect(view.result.current.reactions[slide().postId].ready).toBe(true);
  });

  it("requires a readback after a lost mutation acknowledgement, avoiding a blind toggle retry", async () => {
    fixture.send.mockRejectedValue(new Error("Acknowledgement unavailable"));
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.reactions[slide().postId]?.ready).toBe(true));
    await act(async () => {
      await view.result.current.react(slide() as never, "❤️");
    });
    expect(view.result.current.reactions[slide().postId].ready).toBe(false);
    expect(view.result.current.reactions[slide().postId].error).toBe("Acknowledgement unavailable");
    await act(async () => {
      await view.result.current.react(slide() as never, "❤️");
    });
    expect(fixture.send).toHaveBeenCalledTimes(1);
    fixture.reactions.mockResolvedValue([{ ...reaction, fromIdentityUserId: fixture.owner }]);
    await act(async () => {
      await view.result.current.retryReaction(slide() as never, true);
    });
    expect(view.result.current.reactions[slide().postId].summary?.myEmojis).toEqual(["❤️"]);
  });

  it("ignores a delayed mutation acknowledgement after account ownership changes", async () => {
    const ack = deferred<unknown>();
    fixture.send.mockReturnValue(ack.promise);
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.reactions[slide().postId]?.ready).toBe(true));
    let pending!: Promise<void>;
    act(() => {
      pending = view.result.current.react(slide() as never, "❤️");
    });
    fixture.owner = null;
    fixture.generation++;
    act(() => window.dispatchEvent(new CustomEvent("spotibuds:session")));
    await act(async () => {
      ack.resolve({ action: "added", postId: slide().postId });
      await pending;
    });
    expect(view.result.current.slides).toEqual([]);
    expect(view.result.current.reactions).toEqual({});
    expect(view.result.current.reactionFlash).toEqual({});
  });

  it("shows exact server totals and pages people without deriving totals from loaded names", async () => {
    fixture.reactions.mockResolvedValue({
      postId: slide().postId,
      total: 125,
      counts: [{ emoji: "❤️", count: 125 }],
      myEmojis: ["❤️"],
    });
    fixture.people
      .mockResolvedValueOnce({
        items: [reaction],
        nextCursor: "people-next",
        hasMore: true,
        total: 125,
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...reaction,
            fromIdentityUserId: "00000000-0000-4000-8000-000000000003",
            fromUserName: "Carol",
          },
        ],
        nextCursor: null,
        hasMore: false,
        total: 125,
      });
    render(<FeedPage />);
    const open = await screen.findByRole("button", { name: "View reactions" });
    open.focus();
    fireEvent.click(open);
    const dialog = await screen.findByRole("dialog", { name: "Reactions" });
    expect(dialog.textContent).toContain("Reactions (125)");
    fireEvent.click(await screen.findByRole("button", { name: "Load more reactions" }));
    await screen.findByText("Carol");
    expect(fixture.people.mock.calls[1][1]).toBe("people-next");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("keeps unavailable catalogue snapshots while disabling playback", async () => {
    fixture.song.mockRejectedValue(new Error("Song not found"));
    render(<FeedPage />);
    await screen.findByText("Song not found");
    expect(screen.getByText("Morning Loop")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Play Morning Loop" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it.each(
    [
      { kind: "empty", fileUrl: "" },
      { kind: "whitespace", fileUrl: " \t " },
      { kind: "missing", fileUrl: undefined },
    ].flatMap(value =>
      ["recent_song", "now_playing", "top_songs_week"].map(type => ({ ...value, type }))
    )
  )("retains $type content but disables $kind audio playback", async ({ type, fileUrl }) => {
    fixture.slides.mockResolvedValue([
      {
        ...slide(type === "now_playing" ? `nowplaying:${author}:${songId}` : undefined, type),
        ...(type === "top_songs_week"
          ? { topSongs: [{ songId, songTitle: "Morning Loop", count: 3 }] }
          : {}),
      },
    ]);
    fixture.song.mockResolvedValue({ id: songId, title: "   ", artists: [], fileUrl });
    render(<FeedPage />);
    await screen.findByText("Playback unavailable. The post remains available.");
    const button = screen.getByRole("button", { name: "Play Morning Loop" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Morning Loop")).toBeTruthy();
    fireEvent.click(button);
    expect(fixture.play).not.toHaveBeenCalled();
  });

  it("uses canonical week/comparison identities and account-scoped valid72h seen memory", () => {
    const weekly = {
      ...slide(),
      type: "top_artists_week",
      postId: `weekly:artists:${author}:20261004`,
      topArtists: [],
    };
    const next = { ...weekly, postId: `weekly:artists:${author}:20261011` };
    expect(feedSlideKey(weekly as never)).not.toBe(feedSlideKey(next as never));
    localStorage.setItem(
      `feed_seen_v2:${fixture.owner}`,
      JSON.stringify({
        current: Date.now(),
        expired: Date.now() - 73 * 3600000,
        future: Date.now() + 1000,
        invalid: "now",
      })
    );
    expect(Object.keys(readFeedSeen(fixture.owner!))).toEqual(["current"]);
    expect(readFeedSeen(author)).toEqual({});
    const group = Array.from({ length: 12 }, (_, index) => ({
      ...slide(`${index}`),
      identityUserId: index % 2 ? author : fixture.owner!,
    }));
    expect(chunkedShuffle(group as never, "fixed")).toEqual(
      chunkedShuffle(group as never, "fixed")
    );
    expect(
      declumpAuthors(group as never, fixture.owner!)
        .map(item => item.identityUserId)
        .slice(0, 2)
    ).toEqual([author, fixture.owner]);
  });

  it("does not expose an old owner's loaded state even in the render before reset effects", async () => {
    const renders: string[][] = [];
    const view = renderHook(() => {
      const value = useFeed();
      renders.push(value.slides.map(item => item.postId!));
      return value;
    });
    await waitFor(() => expect(view.result.current.slides.length).toBe(1));
    fixture.slides.mockReturnValue(new Promise(() => {}));
    const before = renders.length;
    fixture.owner = "00000000-0000-4000-8000-000000000003";
    fixture.generation++;
    act(() => window.dispatchEvent(new CustomEvent("spotibuds:session")));
    expect(renders.slice(before).every(items => items.length === 0)).toBe(true);
  });

  it("keeps the actually visible post active when an earlier post emits only an exit entry", async () => {
    fixture.slides.mockResolvedValue([
      slide(),
      { ...slide("000000000000000000000011"), songTitle: "Second" },
    ]);
    const view = render(<FeedPage />);
    await screen.findByText("Second");
    const sections = Array.from(
      view.container.querySelectorAll<HTMLElement>("[data-feed-post-id]")
    );
    const observer = observers.filter(item => item.elements.includes(sections[0])).at(-1)!;
    const entry = (target: Element, ratio: number) =>
      ({
        target,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      }) as IntersectionObserverEntry;
    act(() =>
      observer.callback(
        [entry(sections[0], 0.8), entry(sections[1], 0.5)],
        {} as IntersectionObserver
      )
    );
    act(() => observer.callback([entry(sections[0], 0)], {} as IntersectionObserver));
    expect(
      screen.getByRole("button", { name: "Add ❤️ reaction" }).closest("[data-feed-post-id]")
    ).toBe(sections[1]);
  });

  it("allows keyboard navigation from the last post to the end section without an extra fetch", async () => {
    const view = render(<FeedPage />);
    await screen.findByText("Morning Loop");
    const sections = view.container.querySelectorAll<HTMLElement>("[data-feed-navigation-section]");
    const container = view.container.querySelector<HTMLElement>("[aria-label^='Feed posts']")!;
    container.scrollTop = 40;
    Object.defineProperty(container, "clientTop", { configurable: true, value: 2 });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ top: 160 } as DOMRect);
    vi.spyOn(sections[1], "getBoundingClientRect").mockReturnValue({ top: 840 } as DOMRect);
    fireEvent.keyDown(container, { key: "ArrowDown" });
    await waitFor(() =>
      expect(container.scrollTo).toHaveBeenCalledWith({ top: 718, behavior: "smooth" })
    );
    expect(vi.mocked(HTMLElement.prototype.scrollTo).mock.instances.at(-1)).toBe(container);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(fixture.slides).toHaveBeenCalledTimes(1);
  });

  it("updates deep-link focus when the target changes at the same loaded item count", async () => {
    fixture.slides.mockResolvedValue([
      slide(),
      { ...slide("000000000000000000000011"), songTitle: "Second" },
    ]);
    const view = render(<FeedPage />);
    await screen.findByText("Second");
    const container = view.container.querySelector<HTMLElement>("[aria-label^='Feed posts']")!;
    const target = view.container.querySelector<HTMLElement>(
      "[data-feed-post-id='000000000000000000000011']"
    )!;
    container.scrollTop = 20;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ top: 144 } as DOMRect);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 620 } as DOMRect);
    fixture.query = "postId=000000000000000000000011";
    view.rerender(<FeedPage />);
    await waitFor(() =>
      expect(container.scrollTo).toHaveBeenCalledWith({ top: 496, behavior: "smooth" })
    );
    expect(vi.mocked(HTMLElement.prototype.scrollTo).mock.instances.at(-1)).toBe(container);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(fixture.slides).toHaveBeenCalledTimes(1);
  });

  it("shows the shared reaction badge and people on the live card after its persisted alias updates", async () => {
    const live = slide(`nowplaying:${author}:${songId}`, "now_playing");
    const recent = slide();
    fixture.slides.mockResolvedValue([live, recent]);
    let saved = false;
    fixture.reactions.mockImplementation(async () => ({
      postId: recent.postId,
      total: saved ? 1 : 0,
      counts: saved ? [{ emoji: "❤️", count: 1 }] : [],
      myEmojis: saved ? ["❤️"] : [],
    }));
    fixture.send.mockImplementation(async () => {
      saved = true;
      return { success: true, action: "added", postId: recent.postId };
    });
    const view = render(<FeedPage />);
    await screen.findByText("Now Playing");
    const liveSection = view.container.querySelector<HTMLElement>(
      "[data-feed-type='now_playing']"
    )!;
    const recentSection = view.container.querySelector<HTMLElement>(
      "[data-feed-type='recent_song']"
    )!;
    const observer = observers.filter(item => item.elements.includes(liveSection)).at(-1)!;
    act(() =>
      observer.callback(
        [
          {
            target: liveSection,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: liveSection.getBoundingClientRect(),
            intersectionRect: liveSection.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          },
        ],
        {} as IntersectionObserver
      )
    );
    const heart = await within(liveSection).findByRole("button", { name: "Add ❤️ reaction" });
    await waitFor(() => expect(heart.hasAttribute("disabled")).toBe(false));
    fireEvent.click(heart);
    const badge = await within(liveSection).findByRole("button", { name: "View reactions" });
    expect(within(recentSection).getByRole("button", { name: "View reactions" })).toBeTruthy();
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(badge);
    await screen.findByRole("dialog", { name: "Reactions" });
    await waitFor(() =>
      expect(fixture.people).toHaveBeenCalledWith(recent.postId, null, expect.any(AbortSignal))
    );
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });

  it("preserves the original live mutation reference while readback synchronizes its persisted alias", async () => {
    const live = slide(`nowplaying:${author}:${songId}`, "now_playing");
    fixture.slides.mockResolvedValue([live]);
    let saved = false;
    fixture.reactions.mockImplementation(async () => ({
      postId: slide().postId,
      total: saved ? 1 : 0,
      counts: saved ? [{ emoji: "❤️", count: 1 }] : [],
      myEmojis: saved ? ["❤️"] : [],
    }));
    fixture.send.mockImplementation(async () => {
      saved = true;
      return { success: true, action: "added", postId: slide().postId };
    });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.reactions[live.postId]?.ready).toBe(true));
    await act(async () => {
      await view.result.current.react(live as never, "❤️");
    });
    expect(fixture.send.mock.calls[0][0].postId).toBe(live.postId);
    expect(fixture.reactions.mock.calls.at(-1)?.[0]).toBe(slide().postId);
    expect(view.result.current.reactions[live.postId].summary?.myEmojis).toEqual(["❤️"]);
    expect(view.result.current.reactionFlash[live.postId]?.label).toBe("Reaction added");
  });

  it("does not duplicate held song/profile enrichment across consecutive pages", async () => {
    const song = deferred<unknown>();
    const profile = deferred<unknown>();
    fixture.song.mockReturnValue(song.promise);
    fixture.profile.mockReturnValue(profile.promise);
    fixture.slides
      .mockResolvedValueOnce({ items: [slide()], nextCursor: "next", hasMore: true })
      .mockResolvedValueOnce({
        items: [slide("000000000000000000000011")],
        nextCursor: null,
        hasMore: false,
      });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.slides.length).toBe(1));
    await act(async () => {
      await view.result.current.load();
    });
    expect(fixture.song).toHaveBeenCalledTimes(1);
    expect(fixture.profile).toHaveBeenCalledTimes(1);
    await act(async () => {
      song.resolve({ id: songId, title: "Morning Loop", artists: [] });
      profile.resolve({ username: "Bob" });
    });
    expect(view.result.current.songs[songId]?.title).toBe("Morning Loop");
  });

  it("releases an open reaction dialog when an authoritative update removes its final reaction", async () => {
    const summary = {
      postId: slide().postId,
      total: 1,
      counts: [{ emoji: "❤️", count: 1 }],
      myEmojis: [],
    };
    const view = render(<ReactionSummaryView summary={summary} ownerId={fixture.owner!} />);
    fireEvent.click(screen.getByRole("button", { name: "View reactions" }));
    await screen.findByRole("dialog", { name: "Reactions" });
    view.rerender(
      <ReactionSummaryView
        summary={{ ...summary, total: 0, counts: [] }}
        ownerId={fixture.owner!}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<ReactionSummaryView summary={summary} ownerId={fixture.owner!} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rejects malformed cards with a visible recovery error instead of an enrichment crash or false empty state", async () => {
    fixture.slides.mockResolvedValue({
      items: [{ ...slide(), type: "top_songs_week", topSongs: null }],
      nextCursor: null,
      hasMore: false,
    });
    render(<FeedPage />);
    await screen.findByText("The feed continuation is unavailable. Refresh the feed to retry.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText(/No public listening activity/)).toBeNull();
    expect(fixture.song).not.toHaveBeenCalled();
  });

  it("guards live and recent aliases through a held ACK and readback with exactly one toggle", async () => {
    const live = slide(`nowplaying:${author}:${songId}`, "now_playing");
    const recent = slide();
    const summary = { postId: recent.postId, total: 0, counts: [], myEmojis: [] };
    fixture.slides.mockResolvedValue([live, recent]);
    fixture.reactions.mockResolvedValue(summary);
    const ack = deferred<unknown>();
    const readback = deferred<unknown>();
    fixture.send.mockReturnValue(ack.promise);
    const view = renderHook(() => useFeed());
    await waitFor(() =>
      expect(
        view.result.current.reactions[live.postId]?.ready &&
          view.result.current.reactions[recent.postId]?.ready
      ).toBe(true)
    );
    const reads = fixture.reactions.mock.calls.length;
    fixture.reactions.mockReturnValueOnce(readback.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = view.result.current.react(live as never, "❤️");
    });
    await act(async () => {
      await view.result.current.react(recent as never, "❤️");
    });
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(view.result.current.reacting.has(live.postId)).toBe(true);
    expect(view.result.current.reacting.has(recent.postId)).toBe(true);
    expect(view.result.current.reactions[live.postId].ready).toBe(false);
    expect(view.result.current.reactions[recent.postId].ready).toBe(false);
    await act(async () => ack.resolve({ action: "added", success: true, postId: recent.postId }));
    await waitFor(() => expect(fixture.reactions).toHaveBeenCalledTimes(reads + 1));
    await act(async () => {
      await view.result.current.react(recent as never, "❤️");
    });
    expect(fixture.send).toHaveBeenCalledTimes(1);
    await act(async () => {
      readback.resolve({
        ...summary,
        total: 1,
        counts: [{ emoji: "❤️", count: 1 }],
        myEmojis: ["❤️"],
      });
      await pending;
    });
    expect(view.result.current.reactions[live.postId].summary?.myEmojis).toEqual(["❤️"]);
    expect(view.result.current.reactions[recent.postId].summary?.myEmojis).toEqual(["❤️"]);
    expect(view.result.current.reactions[live.postId].ready).toBe(true);
    expect(view.result.current.reactions[recent.postId].ready).toBe(true);
    expect(fixture.send.mock.calls[0][0].postId).toBe(live.postId);
  });

  it("keeps both canonical aliases unknown after a lost ACK until one authoritative reload reconciles them", async () => {
    const live = slide(`nowplaying:${author}:${songId}`, "now_playing");
    const recent = slide();
    fixture.slides.mockResolvedValue([live, recent]);
    fixture.reactions.mockResolvedValue({
      postId: recent.postId,
      total: 0,
      counts: [],
      myEmojis: [],
    });
    fixture.send.mockRejectedValue(new Error("Lost ACK"));
    const view = renderHook(() => useFeed());
    await waitFor(() =>
      expect(
        view.result.current.reactions[live.postId]?.ready &&
          view.result.current.reactions[recent.postId]?.ready
      ).toBe(true)
    );
    await act(async () => {
      await view.result.current.react(live as never, "❤️");
    });
    expect(view.result.current.reactions[live.postId].ready).toBe(false);
    expect(view.result.current.reactions[recent.postId].ready).toBe(false);
    await act(async () => {
      await view.result.current.react(recent as never, "❤️");
    });
    expect(fixture.send).toHaveBeenCalledTimes(1);
    fixture.reactions.mockResolvedValue({
      postId: recent.postId,
      total: 1,
      counts: [{ emoji: "❤️", count: 1 }],
      myEmojis: ["❤️"],
    });
    await act(async () => {
      await view.result.current.retryReaction(recent as never, true);
    });
    expect(view.result.current.reactions[live.postId].ready).toBe(true);
    expect(view.result.current.reactions[recent.postId].ready).toBe(true);
    expect(view.result.current.reactions[live.postId].summary?.myEmojis).toEqual(["❤️"]);
    expect(view.result.current.reactions[recent.postId].summary?.myEmojis).toEqual(["❤️"]);
  });

  it("invalidates an older held alias read so it cannot undo the acknowledged canonical reaction", async () => {
    const live = slide(`nowplaying:${author}:${songId}`, "now_playing");
    const recent = slide();
    const old = deferred<unknown>();
    let held = false;
    let saved = false;
    const summary = () => ({
      postId: recent.postId,
      total: saved ? 1 : 0,
      counts: saved ? [{ emoji: "❤️", count: 1 }] : [],
      myEmojis: saved ? ["❤️"] : [],
    });
    fixture.slides.mockResolvedValue([live, recent]);
    fixture.reactions.mockImplementation(async (postId: string) => {
      if (postId === recent.postId && !held) {
        held = true;
        return old.promise;
      }
      return summary();
    });
    fixture.send.mockImplementation(async () => {
      saved = true;
      return { action: "added", postId: recent.postId, success: true };
    });
    const view = renderHook(() => useFeed());
    await waitFor(() => expect(view.result.current.reactions[live.postId]?.ready).toBe(true));
    await act(async () => {
      await view.result.current.react(live as never, "❤️");
    });
    await act(async () =>
      old.resolve({ postId: recent.postId, total: 0, counts: [], myEmojis: [] })
    );
    expect(view.result.current.reactions[live.postId].summary?.myEmojis).toEqual(["❤️"]);
    expect(view.result.current.reactions[recent.postId].summary?.myEmojis).toEqual(["❤️"]);
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
});

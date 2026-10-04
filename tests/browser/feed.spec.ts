import {
  test,
  expect,
  request as requests,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";

type Account = { username: string; password: string; email: string };
type Session = { token: string; user: { id: string; roles: string[] } };
type Slide = { postId: string; identityUserId: string; type: string; songId?: string };
type FeedPage = { items: Slide[]; hasMore: boolean; nextCursor: string | null };
const identity = "http://127.0.0.1:5101";
const users = "http://127.0.0.1:5103";
const accounts: Account[] = JSON.parse(
  readFileSync("demo/accounts.local.json", "utf8").replace(/^\uFEFF/, "")
);
const fixtures: { songIds: string[] } = JSON.parse(
  readFileSync("demo/fixtures.local.json", "utf8").replace(/^\uFEFF/, "")
);
const headers = (session: Session) => ({
  Authorization: `Bearer ${session.token}`,
  "X-Spotibuds-Request": "1",
});

test.use({ actionTimeout: 15000 });
const pendingFixtureIds = new Set<string>();
// Playwright gives teardown its own timeout after a browser scenario times out.
test.afterEach(async () => cleanup([...pendingFixtureIds]));

async function apiLogin(api: APIRequestContext, account: Account): Promise<Session> {
  const response = await api.post(`${identity}/api/auth/login`, {
    headers: { "X-Spotibuds-Request": "1" },
    data: account,
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function login(page: Page, account: Account) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function createFixture(api: APIRequestContext, ids: string[], authors = 1) {
  const members: Account[] = [];
  const sessions: Session[] = [];
  const suffix = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
  for (let index = 0; index <= authors; index++) {
    const member = {
      username: `feed${suffix}${index}`,
      email: `feed${suffix}${index}@example.test`,
      password: `Fixture!Aa8${crypto.randomUUID()}`,
    };
    const response = await api.post(`${identity}/api/auth/register`, {
      headers: { "X-Spotibuds-Request": "1" },
      data: { ...member, isPrivate: false },
    });
    if (response.status() === 200 || response.status() === 503) {
      const result = (await response.json()) as { userId?: string };
      if (result.userId && /^[a-f0-9-]{36}$/i.test(result.userId)) {
        ids.push(result.userId);
        pendingFixtureIds.add(result.userId);
      }
    }
    expect(response.status()).toBe(200);
    // Independent cookie jars keep the administrative cleanup owner separate.
    const context = await requests.newContext();
    try {
      const session = await apiLogin(context, member);
      expect(session.user.roles).toEqual(["User"]);
      sessions.push(session);
    } finally {
      await context.dispose();
    }
    members.push(member);
  }
  for (const session of sessions) {
    const response = await api.post(`${users}/api/users/${session.user.id}/listening-history`, {
      headers: headers(session),
      data: {
        songId: fixtures.songIds[0],
        songTitle: "Client placeholder",
        artist: "Client placeholder",
        duration: 2,
      },
    });
    expect(response.status()).toBe(200);
  }
  return { members, sessions };
}
async function cleanup(ids: string[]) {
  if (!ids.length) return;
  const api = await requests.newContext();
  try {
    const admin = await apiLogin(api, accounts.find(account => account.username === "demoadmin")!);
    for (const id of ids) {
      const deletion = await api.delete(`${identity}/api/auth/users/${id}`, {
        headers: headers(admin),
      });
      expect([204, 404]).toContain(deletion.status());
      expect(
        (await api.get(`${identity}/api/auth/users/${id}`, { headers: headers(admin) })).status()
      ).toBe(404);
      expect(
        (await api.get(`${users}/api/users/${id}`, { headers: headers(admin) })).status()
      ).toBe(404);
      pendingFixtureIds.delete(id);
    }
    expect(
      (await api.post(`${identity}/api/auth/logout`, { headers: headers(admin) })).status()
    ).toBe(204);
  } finally {
    await api.dispose();
  }
}
async function allSlides(api: APIRequestContext, session: Session) {
  const items: Slide[] = [];
  let cursor: string | null = null;
  const cursors = new Set<string>();
  for (let page = 0; page < 80; page++) {
    const response = await api.get(
      `${users}/api/feed/slides/page?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { headers: headers(session) }
    );
    expect(response.status()).toBe(200);
    const batch = (await response.json()) as FeedPage;
    items.push(...batch.items);
    expect(new Set(items.map(item => item.postId)).size).toBe(items.length);
    expect(items.some(item => item.identityUserId === session.user.id)).toBe(false);
    if (!batch.hasMore) {
      expect(batch.nextCursor).toBeNull();
      return items;
    }
    expect(batch.nextCursor).toBeTruthy();
    expect(cursors.has(batch.nextCursor!)).toBe(false);
    cursors.add(batch.nextCursor!);
    cursor = batch.nextCursor;
  }
  throw new Error("Feed pagination failed to terminate within the fixture bound.");
}

test("ordinary users discover all existing card types and persist reactions across desktop/mobile refresh", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(150000);
  const ids: string[] = [];
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    const { members, sessions } = await createFixture(request, ids);
    const [viewer, author] = sessions;
    const liveId = `nowplaying:${author.user.id}:${fixtures.songIds[0]}`;
    expect(
      (
        await request.post(`${users}/api/feed/nowplaying?ttlSec=180`, {
          headers: headers(author),
          data: { songId: fixtures.songIds[0], positionSec: 0, isPlaying: true },
        })
      ).status()
    ).toBe(200);
    const slides = await allSlides(request, viewer);
    expect(
      new Set(slides.filter(item => item.identityUserId === author.user.id).map(item => item.type))
    ).toEqual(
      new Set([
        "now_playing",
        "recent_song",
        "top_artists_week",
        "top_songs_week",
        "common_artists",
      ])
    );
    await login(page, members[0]);
    await page.goto(`/feed?postId=${encodeURIComponent(liveId)}`);
    const live = page.locator(`section[data-feed-post-id="${liveId}"]`);
    await expect(live).toBeVisible();
    await live.scrollIntoViewIfNeeded();
    await expect(live.getByRole("button", { name: "Add ❤️ reaction", exact: true })).toBeEnabled();
    const toggle = page.waitForResponse(
      response =>
        response.url().endsWith("/api/feed/reactions") && response.request().method() === "POST"
    );
    await live.getByRole("button", { name: "Add ❤️ reaction", exact: true }).click();
    expect((await toggle).status()).toBe(200);
    await expect(
      live.getByRole("button", { name: "Remove ❤️ reaction", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(live.getByRole("button", { name: "View reactions", exact: true })).toBeVisible();
    await live.getByRole("button", { name: "View reactions", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Reactions", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Reactions", exact: true })).toHaveCount(0);
    await expect(live.getByRole("button", { name: "View reactions", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Refresh feed", exact: true })).toBeInViewport();
    // A live-only song must be enriched and playable, independently of recent cards.
    await live.getByTitle("Play", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause playback", exact: true })).toBeVisible();
    const mobilePage = await mobile.newPage();
    await login(mobilePage, members[0]);
    await mobilePage.goto(`/feed?postId=${encodeURIComponent(liveId)}`);
    const mobileLive = mobilePage.locator(`section[data-feed-post-id="${liveId}"]`);
    await mobileLive.scrollIntoViewIfNeeded();
    await expect(
      mobileLive.getByRole("button", { name: "Remove ❤️ reaction", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    const box = await mobileLive
      .getByRole("button", { name: "Remove ❤️ reaction", exact: true })
      .boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(
      await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await mobileLive.getByRole("button", { name: "Remove ❤️ reaction", exact: true }).click();
    await expect(
      mobileLive.getByRole("button", { name: "Add ❤️ reaction", exact: true })
    ).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await live.scrollIntoViewIfNeeded();
    await expect(
      live.getByRole("button", { name: "Add ❤️ reaction", exact: true })
    ).toHaveAttribute("aria-pressed", "false");
  } finally {
    await mobile.close();
    await cleanup(ids);
  }
});

test("ordinary feed visit loads once; failed continuation retains cards and retry merges unique posts", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const ids: string[] = [];
  try {
    const { members, sessions } = await createFixture(request, ids, 4);
    const expected = await allSlides(request, sessions[0]);
    expect(expected.length).toBeGreaterThan(10);
    await login(page, members[0]);
    let initialReads = 0;
    let failed = false;
    await page.route("**/api/feed/slides/page?**", async route => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has("cursor")) initialReads++;
      if (url.searchParams.has("cursor") && !failed) {
        failed = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Feed temporarily unavailable." }),
        });
      } else await route.continue();
    });
    await page.goto("/feed");
    const cards = page.locator("section[data-feed-post-id]");
    await expect(cards).toHaveCount(10);
    expect(initialReads).toBe(1);
    const firstIds = await cards.evaluateAll(elements =>
      elements.map(element => element.getAttribute("data-feed-post-id"))
    );
    await cards.last().scrollIntoViewIfNeeded();
    await expect(page.getByRole("alert").filter({ hasText: /feed|posts/i })).toBeVisible();
    expect(
      await cards.evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-feed-post-id"))
      )
    ).toEqual(firstIds);
    await page.getByRole("button", { name: /retry|try again/i }).click();
    await expect.poll(async () => cards.count()).toBeGreaterThan(10);
    const loadedIds = await cards.evaluateAll(elements =>
      elements.map(element => element.getAttribute("data-feed-post-id"))
    );
    expect(new Set(loadedIds).size).toBe(loadedIds.length);
    expect(loadedIds.slice(0, firstIds.length)).toEqual(firstIds);
    expect(initialReads).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("section[data-feed-post-id]")).toHaveCount(0);
  } finally {
    await cleanup(ids);
  }
});

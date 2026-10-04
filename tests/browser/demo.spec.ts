import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
type Account = { username: string; email: string; password: string };
const accounts = JSON.parse(
  readFileSync("demo/accounts.local.json", "utf8").replace(/^\uFEFF/, "")
) as Account[];
const fixtures = JSON.parse(
  readFileSync("demo/fixtures.local.json", "utf8").replace(/^\uFEFF/, "")
) as { songIds: string[]; chatId: string };
const alice = accounts.find(account => account.username === "alice")!;
async function login(page: Page, account: Account = alice) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  const response = page.waitForResponse(
    response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const body = (await (await response).json()) as { token: string; user: { id: string } };
  await expect(page).toHaveURL(/\/dashboard$/);
  return body;
}
test("anonymous recovery is real and public; invalid reset is rejected", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: /password/i })).toBeVisible();
  await page
    .getByLabel("Email Address", { exact: true })
    .fill("absent-browser-fixture@example.test");
  const response = page.waitForResponse(response =>
    response.url().endsWith("/api/auth/forgot-password")
  );
  await page.getByRole("button", { name: /send/i }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText(/if an account|check your email/i).first()).toBeVisible();
  await page.goto("/reset-password?email=absent-browser-fixture%40example.test&token=invalid");
  await page.getByLabel("New password", { exact: true }).fill("InvalidFixture!482");
  await page.getByLabel("Confirm new password", { exact: true }).fill("InvalidFixture!482");
  await page.getByRole("button", { name: /reset password/i }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Reset link is invalid, expired, or already used" })
  ).toBeVisible();
});
test("session survives reload; failed logout remains signed out across reload and cookie operations serialize", async ({
  page,
  context,
}) => {
  const session = await login(page);
  expect(
    await page.evaluate(() => [localStorage.getItem("token"), localStorage.getItem("refreshToken")])
  ).toEqual([null, null]);
  await page.reload();
  await expect(page.getByRole("link", { name: "Playlists", exact: true })).toBeVisible();
  let renewals = 0;
  page.on("request", request => {
    if (request.url().includes("/api/auth/refresh/")) renewals++;
  });
  await page.route("**/api/auth/logout", route =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Controlled Identity logout outage" }),
    })
  );
  await page
    .getByRole("button", { name: /logout|sign out/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem("currentUser"))).toBeNull();
  await expect(
    page.getByRole("alert").filter({ hasText: "server could not revoke" })
  ).toBeVisible();
  expect(
    (
      await page.request.get(`http://127.0.0.1:5102/api/playlists/user/${session.user.id}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
    ).status()
  ).toBe(200);
  const afterLogout = renewals;
  await page.reload();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "server could not revoke" })
  ).toBeVisible();
  expect(renewals).toBe(afterLogout);
  expect(await page.evaluate(() => localStorage.getItem("currentUser"))).toBeNull();
  await page.getByLabel("Username", { exact: true }).fill(alice.username);
  await page.getByLabel("Password", { exact: true }).fill("WrongFixture!731");
  const failedLogin = page.waitForResponse(response => response.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  expect((await failedLogin).status()).toBe(401);
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "server could not revoke" })
  ).toBeVisible();
  expect(renewals).toBe(afterLogout);
  await page.unroute("**/api/auth/logout");
  await page.getByRole("button", { name: "Retry server sign-out", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Signed out on this device." })
  ).toBeVisible();
  expect(
    (
      await page.request.get(`http://127.0.0.1:5102/api/playlists/user/${session.user.id}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
    ).status()
  ).toBe(401);
  await login(page);
  expect(await page.evaluate(() => localStorage.getItem("spotibuds:sign-out"))).toBeNull();

  // Hold a real completed logout response. The other tab's login must wait for
  // its cookie expiry and status acknowledgement, then own the fresh session.
  let release!: () => void;
  let arrived!: () => void;
  let handled!: () => void;
  let logoutIntercepted = false;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  const requested = new Promise<void>(resolve => {
    arrived = resolve;
  });
  const handlerFinished = new Promise<void>(resolve => {
    handled = resolve;
  });
  const other = await context.newPage();
  let loginRequests = 0;
  other.on("request", request => {
    if (request.url().endsWith("/api/auth/login")) loginRequests++;
  });
  await page.route("**/api/auth/logout", async route => {
    logoutIntercepted = true;
    try {
      const response = await route.fetch();
      expect(response.status()).toBe(204);
      arrived();
      await held;
      await route.fulfill({ response });
    } finally {
      handled();
    }
  });
  try {
    await page
      .getByRole("button", { name: /logout|sign out/i })
      .first()
      .click();
    await requested;
    const nextLogin = login(other, accounts.find(account => account.username === "bob")!);
    await expect(other.getByRole("button", { name: "Signing in...", exact: true })).toBeDisabled();
    expect(loginRequests).toBe(0);
    release();
    await nextLogin;
    expect(
      await other.evaluate(
        () => JSON.parse(localStorage.getItem("currentUser") || "null")?.username
      )
    ).toBe("bob");
    expect(await other.evaluate(() => localStorage.getItem("spotibuds:sign-out"))).toBeNull();
    await other.reload();
    await expect(other.getByRole("link", { name: "Playlists", exact: true })).toBeVisible();
    await other
      .getByRole("button", { name: /logout|sign out/i })
      .first()
      .click();
    await expect(other).toHaveURL(/\/$/);
  } finally {
    release();
    if (logoutIntercepted) await handlerFinished;
    await page.unroute("**/api/auth/logout");
    await other.close();
  }
});
test("playlist create and edit persist through real API and reload; failed creation keeps draft", async ({
  page,
}) => {
  const session = await login(page);
  const name = `Browser playlist ${Date.now()}`;
  await page.goto("/playlists");
  await page.getByRole("button", { name: "Create Playlist", exact: true }).first().click();
  await page.locator("#playlist-name").fill(name);
  await page.locator("#playlist-description").fill("Browser persistence fixture");
  const created = page.waitForResponse(
    response =>
      response.request().method() === "POST" && response.url().includes("/api/playlists/user/")
  );
  await page.getByRole("button", { name: "Create Playlist", exact: true }).last().click();
  const playlist = (await (await created).json()) as { id: string };
  try {
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await page.goto(`/playlists/${playlist.id}`);
    await page.getByRole("button", { name: "Edit playlist" }).click();
    await page.getByLabel("Playlist name", { exact: true }).fill(`${name} edited`);
    await page.getByRole("button", { name: /update playlist/i }).click();
    await expect(page.getByRole("heading", { name: `${name} edited`, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: `${name} edited`, exact: true })).toBeVisible();
    await page.goto("/playlists");
    await page.getByRole("button", { name: "Create Playlist", exact: true }).first().click();
    await page.locator("#playlist-name").fill("Retained failure draft");
    await page.route("**/api/playlists/user/**", route =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "Controlled Music outage" }),
          })
        : route.continue()
    );
    await page.getByRole("button", { name: "Create Playlist", exact: true }).last().click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Controlled Music outage" })
    ).toContainText("Controlled Music outage");
    await expect(page.locator("#playlist-name")).toHaveValue("Retained failure draft");
  } finally {
    await page.request.delete(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, {
      headers: { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" },
    });
  }
});
test("real media plays and logout stops and clears the audio element", async ({
  page,
  request,
}) => {
  const session = await login(page);
  const response = await page.request.post(
    `http://127.0.0.1:5102/api/playlists/user/${session.user.id}`,
    {
      data: { name: `Playback fixture ${Date.now()}` },
      headers: { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" },
    }
  );
  expect(response.status()).toBe(201);
  const playlist = (await response.json()) as { id: string };
  try {
    await page.request.post(
      `http://127.0.0.1:5102/api/playlists/${playlist.id}/songs/${fixtures.songIds[0]}`,
      { headers: { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" } }
    );
    await page.goto(`/playlists/${playlist.id}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(
        () =>
          page.locator("audio").evaluate((audio: HTMLAudioElement) => ({
            paused: audio.paused,
            ready: audio.readyState,
            progressed: audio.currentTime > 0.1,
          })),
        { timeout: 15000 }
      )
      .toEqual({ paused: false, ready: 4, progressed: true });
    await page
      .getByRole("button", { name: /logout|sign out/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((audio: HTMLAudioElement) => ({
          paused: audio.paused,
          source: audio.getAttribute("src"),
        }))
      )
      .toEqual({ paused: true, source: null });
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  } finally {
    // The browser logout has revoked its original family. Use this test's
    // independent request fixture so cleanup never revives the signed-out UI.
    const cleanupLogin = await request.post("http://127.0.0.1:5101/api/auth/login", {
      headers: { "X-Spotibuds-Request": "1" },
      data: { username: alice.username, password: alice.password, rememberMe: false },
    });
    expect(cleanupLogin.status()).toBe(200);
    try {
      const cleanupSession = (await cleanupLogin.json()) as {
        token: string;
        user: { id: string };
      };
      expect(cleanupSession.user.id).toBe(session.user.id);
      const headers = {
        Authorization: `Bearer ${cleanupSession.token}`,
        "X-Spotibuds-Request": "1",
      };
      expect(
        (
          await request.delete(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, { headers })
        ).status()
      ).toBe(204);
      expect(
        (
          await request.get(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, { headers })
        ).status()
      ).toBe(404);
      const persistedList = await request.get(
        `http://127.0.0.1:5102/api/playlists/user/${session.user.id}`,
        { headers }
      );
      expect(persistedList.status()).toBe(200);
      expect(
        ((await persistedList.json()) as { id: string }[]).some(item => item.id === playlist.id)
      ).toBe(false);
    } finally {
      expect(
        (
          await request.post("http://127.0.0.1:5101/api/auth/logout", {
            headers: { "X-Spotibuds-Request": "1" },
          })
        ).status()
      ).toBe(204);
    }
  }
});

test("playlist cover, ordering and removals persist through the UI and real API", async ({
  page,
}) => {
  const session = await login(page);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  const created = await page.request.post(
    `http://127.0.0.1:5102/api/playlists/user/${session.user.id}`,
    { data: { name: `Ordered fixture ${Date.now()}` }, headers }
  );
  const playlist = (await created.json()) as { id: string };
  try {
    for (const id of fixtures.songIds)
      expect(
        (
          await page.request.post(
            `http://127.0.0.1:5102/api/playlists/${playlist.id}/songs/${id}`,
            { headers }
          )
        ).ok()
      ).toBe(true);
    await page.goto(`/playlists/${playlist.id}`);
    await page.getByRole("button", { name: "Edit playlist" }).click();
    const cover = page.waitForResponse(
      response =>
        response.url().includes(`/playlists/${playlist.id}/cover`) &&
        response.request().method() === "POST"
    );
    await page.getByLabel("Upload playlist cover").setInputFiles("demo/assets/cover.png");
    expect((await cover).ok()).toBe(true);
    await expect(
      page.getByRole("img", { name: "Playlist cover", exact: true }).last()
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const song = (await (
      await page.request.get(`http://127.0.0.1:5102/api/songs/${fixtures.songIds[0]}`)
    ).json()) as { title: string };
    const reordered = page.waitForResponse(
      response => response.url().endsWith("/songs/reorder") && response.request().method() === "PUT"
    );
    await page.getByRole("button", { name: `Move ${song.title} down`, exact: true }).click();
    expect((await reordered).ok()).toBe(true);
    await page.reload();
    const detail = (await (
      await page.request.get(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, { headers })
    ).json()) as { songs: { id: string }[]; coverUrl: string };
    expect(detail.songs.map(item => item.id)).toEqual([...fixtures.songIds].reverse());
    expect(detail.coverUrl).toContain("/api/media/blob/");
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Remove from playlist" }).first().click();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, {
                headers,
              })
            ).json()
          ).songs.length
      )
      .toBe(fixtures.songIds.length - 1);
  } finally {
    await page.request.delete(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, { headers });
  }
});

test("direct chat joins, renders acknowledged messages once and keeps rejected drafts", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/chat/${fixtures.chatId}`);
  const input = page.getByPlaceholder("Type a message...");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  const content = `Browser acknowledged fixture ${Date.now()}`;
  await input.fill(content);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByText(content, { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByText(content, { exact: true })).toHaveCount(1);
  const rejected = "x".repeat(4001);
  await input.fill(rejected);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /error|failed|invalid|maximum/i })
      .first()
  ).toBeVisible();
  await expect(input).toHaveValue(rejected);
});

test("clearing profile fields persists after save and a complete reload", async ({ page }) => {
  const session = await login(page);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  const url = `http://127.0.0.1:5103/api/users/identity/${session.user.id}`;
  const original = (await (await page.request.get(url, { headers })).json()) as {
    displayName: string;
    bio: string;
  };
  try {
    await page.request.put(url, {
      headers,
      data: { displayName: "Clearable browser fixture", bio: "Clearable browser bio" },
    });
    await page.goto("/user/edit");
    await expect(page.getByPlaceholder("Enter your display name (optional)")).toHaveValue(
      "Clearable browser fixture"
    );
    await page.getByPlaceholder("Enter your display name (optional)").fill("");
    await page.getByPlaceholder("Tell others about yourself...").fill("");
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/user/${session.user.id}$`));
    await page.goto("/user/edit");
    await expect(page.getByPlaceholder("Enter your display name (optional)")).toHaveValue("");
    await expect(page.getByPlaceholder("Tell others about yourself...")).toHaveValue("");
  } finally {
    await page.request.put(url, {
      headers,
      data: { displayName: original.displayName || "", bio: original.bio || "" },
    });
  }
});

test("search cancellation prevents stale results and clearing stops loading", async ({ page }) => {
  await login(page);
  await page.goto("/search");
  const input = page.getByPlaceholder("Search for songs, artists, albums, or users...");
  let aStarted!: () => void;
  const started = new Promise<void>(resolve => {
    aStarted = resolve;
  });
  await page.route("**/api/search?**", async route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "older") {
      aStarted();
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          songs: [
            {
              id: query,
              title: query === "older" ? "Stale result fixture" : "Latest result fixture",
              artists: [],
              durationSec: 1,
            },
          ],
          albums: [],
          artists: [],
        }),
      });
    } catch {}
  });
  await input.fill("older");
  await started;
  await input.fill("newer");
  await expect(page.getByText("Latest result fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("Stale result fixture", { exact: true })).toHaveCount(0);
  await input.fill("");
  await expect(page.getByText("Latest result fixture", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Searching for/)).toHaveCount(0);
});

test("history loads real entries, survives reload and missing profiles exit loading", async ({
  page,
}) => {
  const session = await login(page);
  await page.goto(`/user/${session.user.id}/listening-history`);
  await expect(page.locator("ol > li").first()).toBeVisible();
  await page.reload();
  await expect(page.locator("ol > li").first()).toBeVisible();
  await expect(page.getByText(/oldest retained/)).toBeVisible();
  await page.goto("/user/00000000-0000-0000-0000-000000000001/listening-history");
  await expect(
    page
      .locator("main")
      .getByRole("alert")
      .filter({ hasText: "Profile not found. Retry profile reconciliation." })
  ).toBeVisible();
  await expect(page.getByText("Loading listening history…")).toHaveCount(0);
});

test("native playback publishes now-playing beyond its TTL and pause clears it", async ({
  page,
}) => {
  test.setTimeout(155000);
  const session = await login(page);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  const songs = (await (await page.request.get("http://127.0.0.1:5102/api/songs")).json()) as {
    id: string;
    durationSec: number;
  }[];
  const long = songs.find(song => song.durationSec >= 120)!;
  const created = await page.request.post(
    `http://127.0.0.1:5102/api/playlists/user/${session.user.id}`,
    { data: { name: `Heartbeat fixture ${Date.now()}` }, headers }
  );
  const playlist = (await created.json()) as { id: string };
  try {
    await page.request.post(`http://127.0.0.1:5102/api/playlists/${playlist.id}/songs/${long.id}`, {
      headers,
    });
    await page.goto(`/playlists/${playlist.id}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime), {
        timeout: 130000,
        intervals: [1000],
      })
      .toBeGreaterThanOrEqual(120);
    const status = (await (
      await page.request.post("http://127.0.0.1:5103/api/feed/nowplaying/batch", {
        headers,
        data: { userIds: [session.user.id] },
      })
    ).json()) as { songId: string; updatedAt: string; positionSec: number }[];
    expect(status).toHaveLength(1);
    expect(status[0].songId).toBe(long.id);
    expect(status[0].positionSec).toBeGreaterThanOrEqual(89);
    expect(Date.now() - Date.parse(status[0].updatedAt)).toBeLessThan(40000);
    await page.getByRole("button", { name: "Pause playback", exact: true }).first().click();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.post("http://127.0.0.1:5103/api/feed/nowplaying/batch", {
                headers,
                data: { userIds: [session.user.id] },
              })
            ).json()
          ).length
      )
      .toBe(0);
  } finally {
    await page.request.delete(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, { headers });
  }
});

test("player seeks real media and handles previous, next, repeat, shuffle and finite queue", async ({
  page,
}) => {
  const session = await login(page);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  const songs = (await (await page.request.get("http://127.0.0.1:5102/api/songs")).json()) as {
    id: string;
    title: string;
    durationSec: number;
  }[];
  const long = songs.find(song => song.durationSec >= 120)!;
  const short = songs.find(song => song.durationSec < 30)!;
  const playlist = (await (
    await page.request.post(`http://127.0.0.1:5102/api/playlists/user/${session.user.id}`, {
      headers,
      data: { name: `Player controls ${Date.now()}` },
    })
  ).json()) as { id: string };
  const audio = page.locator("audio");
  const activeSong = () =>
    audio.evaluate(
      (element: HTMLAudioElement) => new URL(element.src).searchParams.get("url") || element.src
    );
  const assertTrack = async (song: typeof long) => {
    const dto = (await (
      await page.request.get(`http://127.0.0.1:5102/api/songs/${song.id}`)
    ).json()) as { fileUrl: string };
    await expect.poll(activeSong).toBe(dto.fileUrl);
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
      .toBe(4);
  };
  try {
    for (const song of [long, short])
      expect(
        (
          await page.request.post(
            `http://127.0.0.1:5102/api/playlists/${playlist.id}/songs/${song.id}`,
            { headers }
          )
        ).ok()
      ).toBe(true);
    await page.goto(`/playlists/${playlist.id}`);
    await page.getByRole("button", { name: `Play ${long.title}`, exact: true }).click();
    await assertTrack(long);
    await page.getByRole("button", { name: "Open music player", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Music player" });
    await dialog.getByRole("slider", { name: "Playback position", exact: true }).fill("40");
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeGreaterThanOrEqual(39.8);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeLessThan(
      44
    );
    await dialog.getByRole("button", { name: "Next song", exact: true }).click();
    await assertTrack(short);
    await dialog.getByRole("button", { name: "Previous song", exact: true }).click();
    await assertTrack(long);
    await dialog.getByRole("button", { name: "Repeat off", exact: true }).click();
    await dialog.getByRole("button", { name: "Repeat all", exact: true }).click();
    await dialog.getByRole("slider", { name: "Playback position", exact: true }).fill("124.9");
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime), {
        timeout: 8000,
      })
      .toBeLessThan(3);
    await assertTrack(long);
    await dialog.getByRole("button", { name: "Repeat one", exact: true }).click();
    await dialog.getByRole("button", { name: "Shuffle", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Shuffle", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await dialog.getByRole("button", { name: "Next song", exact: true }).click();
    await assertTrack(short);
    await dialog.getByRole("button", { name: "Shuffle", exact: true }).click();
    await dialog.getByRole("button", { name: "Close music player", exact: true }).click();
    await page.getByRole("button", { name: "Add to queue", exact: true }).first().click();
    await page.getByRole("button", { name: "Next song", exact: true }).first().click();
    await assertTrack(long);
    await page.getByRole("button", { name: "Next song", exact: true }).first().click();
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Play playback", exact: true }).first()
    ).toBeEnabled();
  } finally {
    await page.request.delete(`http://127.0.0.1:5102/api/playlists/${playlist.id}`, { headers });
  }
});

test("playlist detail fits a narrow screen and names song actions", async ({ page }) => {
  const session = await login(page);
  const playlists = (await (
    await page.request.get(`http://127.0.0.1:5102/api/playlists/user/${session.user.id}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
  ).json()) as { id: string; name: string }[];
  const seeded = playlists.find(playlist => playlist.name === "Demo Favorites")!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/playlists/${seeded.id}`);
  const sidebar = page.getByTestId("app-sidebar");
  if (await page.getByRole("button", { name: "Close sidebar", exact: true }).count())
    await page.getByRole("button", { name: "Close sidebar", exact: true }).click();
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await expect(sidebar).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  expect(await sidebar.evaluate(element => element.contains(document.activeElement))).toBe(false);
  await expect(page.getByRole("heading", { name: "Demo Favorites", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(0);
  await expect(page.getByRole("button", { name: "Play Morning Loop", exact: true })).toBeVisible();
});

test("history pagination loads 105 distinct persisted entries for a disposable account", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const username = `browserhistory${Date.now()}`;
  const account = {
    username,
    email: `${username}@example.test`,
    password: `Fixture!Aa8${crypto.randomUUID()}`,
  };
  expect(
    (
      await request.post("http://127.0.0.1:5101/api/auth/register", {
        data: account,
        headers: { "X-Spotibuds-Request": "1" },
      })
    ).status()
  ).toBe(200);
  const session = await login(page, account);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  try {
    for (let index = 0; index < 105; index++)
      expect(
        (
          await page.request.post(
            `http://127.0.0.1:5103/api/users/identity/${session.user.id}/listening-history`,
            {
              headers,
              data: { songId: fixtures.songIds[index % fixtures.songIds.length], duration: 1 },
            }
          )
        ).ok()
      ).toBe(true);
    await page.goto(`/user/${session.user.id}/listening-history`);
    await expect(page.locator("ol > li")).toHaveCount(50);
    await page.getByRole("button", { name: "Load older entries", exact: true }).click();
    await expect(page.locator("ol > li")).toHaveCount(100);
    await page.getByRole("button", { name: "Load older entries", exact: true }).click();
    await expect(page.locator("ol > li")).toHaveCount(105);
    expect(
      await page
        .locator("ol time")
        .evaluateAll(times => new Set(times.map(time => time.getAttribute("datetime"))).size)
    ).toBe(105);
    await expect(page.getByText(/oldest retained/)).toBeVisible();
  } finally {
    const admin = accounts.find(account => account.username === "demoadmin")!;
    const auth = (await (
      await request.post("http://127.0.0.1:5101/api/auth/login", {
        headers: { "X-Spotibuds-Request": "1" },
        data: { username: admin.username, password: admin.password },
      })
    ).json()) as { token: string };
    expect(
      (
        await request.delete(`http://127.0.0.1:5101/api/auth/users/${session.user.id}`, {
          headers: { Authorization: `Bearer ${auth.token}`, "X-Spotibuds-Request": "1" },
        })
      ).ok()
    ).toBe(true);
  }
});

test("two users receive chat and read receipts initially and after an offline reconnect", async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  await login(page);
  const second = await browser.newContext();
  const bobPage = await second.newPage();
  try {
    await login(bobPage, accounts.find(account => account.username === "bob")!);
    await page.goto(`/chat/${fixtures.chatId}`);
    const content = `Two-user initial ${Date.now()}`;
    const input = page.getByPlaceholder("Type a message...");
    await input.fill(content);
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled({
      timeout: 20000,
    });
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText(content, { exact: true })).toHaveCount(1);
    await bobPage.goto(`http://127.0.0.1:3100/chat/${fixtures.chatId}`);
    await expect(bobPage.getByText(content, { exact: true })).toHaveCount(1);
    await expect(page.getByText(content, { exact: true }).locator("..")).toContainText("✓✓", {
      timeout: 20000,
    });
    const kept = `Kept while disconnected ${Date.now()}`;
    await second.setOffline(true);
    await bobPage.getByPlaceholder("Type a message...").fill(kept);
    await expect(bobPage.getByRole("button", { name: "Send message", exact: true })).toBeDisabled({
      timeout: 45000,
    });
    await expect(bobPage.getByPlaceholder("Type a message...")).toHaveValue(kept);
    await second.setOffline(false);
    await expect(bobPage.getByRole("button", { name: "Send message", exact: true })).toBeEnabled({
      timeout: 45000,
    });
    await bobPage.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(bobPage.getByPlaceholder("Type a message...")).toHaveValue("");
    await expect(page.getByText(kept, { exact: true })).toHaveCount(1);
    const after = `After reconnect ${Date.now()}`;
    await input.fill(after);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(bobPage.getByText(after, { exact: true })).toHaveCount(1);
    await expect(page.getByText(after, { exact: true }).locator("..")).toContainText("✓✓", {
      timeout: 20000,
    });
  } finally {
    await second.close();
  }
});

test("accepted private friend remains visible by permitted summary and can open chat", async ({
  page,
}) => {
  await login(page);
  await page.goto("/friends");
  await expect(page.getByText("bob", { exact: true })).toBeVisible();
  await expect(page.getByText("No friends yet", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await page.getByRole("heading", { name: "bob", exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/chat/${fixtures.chatId}$`));
  await expect(page.getByRole("heading", { name: "bob", exact: true })).toBeVisible();
});

test("administrator creates, edits, discovers and deletes a catalogue through the UI", async ({
  page,
}) => {
  test.setTimeout(90000);
  const session = await login(page, accounts.find(account => account.username === "demoadmin")!);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  const suffix = Date.now();
  const artistName = `Browser artist ${suffix}`;
  const renamedArtist = `${artistName} edited`;
  const albumName = `Browser album ${suffix}`;
  const renamedAlbum = `${albumName} edited`;
  const songName = `Browser song ${suffix}`;
  let artistId = "",
    albumId = "",
    songId = "";
  let stage = "artist create";
  const failures: string[] = [];
  page.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400 || path.includes("/api/auth/refresh/"))
      failures.push(`${response.request().method()} ${path} ${response.status()}`);
  });
  const dismissSuccess = async () => {
    await page.getByRole("button", { name: "OK", exact: true }).click();
  };
  const card = (text: string) => page.getByText(text, { exact: true }).locator("..");
  const mutation = (path: string, method: string) =>
    page.waitForResponse(
      response => response.url().endsWith(path) && response.request().method() === method,
      { timeout: 10000 }
    );
  try {
    await page.goto("/admin/artists");
    await page.getByRole("button", { name: "Create New Artist", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Artist editor" });
    await dialog.getByLabel("Name", { exact: true }).fill(artistName);
    await dialog.getByLabel("BIO", { exact: true }).fill("UI catalogue fixture");
    await dialog.getByLabel("image File", { exact: true }).setInputFiles("demo/assets/cover.png");
    let response = mutation("/api/admin/artists", "POST");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    artistId = (await (await response).json()).id;
    await dismissSuccess();
    await card(artistName).getByRole("button", { name: "Update", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Artist editor" });
    await dialog.getByLabel("Name", { exact: true }).fill(renamedArtist);
    await dialog.getByLabel("BIO", { exact: true }).fill("");
    response = mutation(`/api/admin/artists/${artistId}`, "PUT");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await dismissSuccess();
    await page.reload();
    await expect(page.getByText(renamedArtist, { exact: true })).toBeVisible();
    expect(
      (await (await page.request.get(`http://127.0.0.1:5102/api/artists/${artistId}`)).json()).bio
    ).toBe("");
    await page.goto("/admin");
    await page.getByRole("button", { name: "Create New Album", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Album editor" });
    await dialog.getByLabel("Title", { exact: true }).fill(albumName);
    await dialog.getByLabel("Search Artist", { exact: true }).fill(renamedArtist);
    await dialog.getByRole("button", { name: renamedArtist, exact: true }).click();
    await dialog.getByLabel("release Date", { exact: true }).fill("2026-10-03");
    await dialog.getByLabel("cover File", { exact: true }).setInputFiles("demo/assets/cover.png");
    response = mutation("/api/admin/albums", "POST");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    albumId = (await (await response).json()).id;
    await dismissSuccess();
    await card(albumName).getByRole("button", { name: "Update", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Album editor" });
    await dialog.getByLabel("Title", { exact: true }).fill(renamedAlbum);
    response = mutation(`/api/admin/albums/${albumId}`, "PUT");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await dismissSuccess();
    stage = "song create and edit";
    await page.goto("/admin/songs");
    await page.getByRole("button", { name: "Create New Song", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Song editor" });
    await dialog.getByLabel("Title", { exact: true }).fill(songName);
    await dialog.getByLabel("Search Artist", { exact: true }).fill(renamedArtist);
    await dialog.getByRole("button", { name: renamedArtist, exact: true }).click();
    await dialog.getByLabel("Search Album", { exact: true }).fill(renamedAlbum);
    await dialog.getByRole("button", { name: renamedAlbum, exact: true }).click();
    await dialog
      .getByLabel("audio File", { exact: true })
      .setInputFiles("demo/assets/morning-loop.wav");
    await dialog.getByLabel("cover File", { exact: true }).setInputFiles("demo/assets/cover.png");
    await expect(dialog.getByText("Duration: 12s", { exact: true })).toBeVisible();
    response = mutation("/api/admin/songs", "POST");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    songId = (await (await response).json()).id;
    await dismissSuccess();
    await card(songName).getByRole("button", { name: "Update", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Song editor" });
    await dialog.getByLabel("Title", { exact: true }).fill(`${songName} edited`);
    response = mutation(`/api/admin/songs/${songId}`, "PUT");
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await dismissSuccess();
    stage = "public album and artist discovery";
    await page.goto(`/album/${albumId}`);
    await expect(page.getByRole("heading", { name: renamedAlbum, exact: true })).toBeVisible();
    await expect(page.getByText(`${songName} edited`, { exact: true }).first()).toBeVisible();
    await page.goto(`/artist/${artistId}`);
    await expect(page.getByRole("heading", { name: renamedArtist, exact: true })).toBeVisible();
    await expect(page.getByText(renamedAlbum, { exact: true })).toBeVisible();
    for (const [route, title, path] of [
      ["/admin/songs", `${songName} edited`, `/api/admin/songs/${songId}`],
      ["/admin", renamedAlbum, `/api/admin/albums/${albumId}`],
      ["/admin/artists", renamedArtist, `/api/admin/artists/${artistId}`],
    ]) {
      stage = `delete ${route}`;
      await page.goto(route);
      await card(title).getByRole("button", { name: "Delete", exact: true }).click();
      const confirm = page.getByRole("button", { name: /^Yes, delete(?: it!)?$/ });
      await expect(confirm).toBeVisible();
      response = mutation(path, "DELETE");
      await confirm.click();
      expect((await response).ok()).toBe(true);
      await dismissSuccess();
      await page.reload();
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
    expect((await page.request.get(`http://127.0.0.1:5102/api/songs/${songId}`)).status()).toBe(
      404
    );
  } catch (error) {
    throw new Error(
      `Catalogue stage ${stage}: ${error instanceof Error ? error.message : "failed"}; responses: ${failures.join(", ")}`
    );
  } finally {
    for (const [entity, id] of [
      ["songs", songId],
      ["albums", albumId],
      ["artists", artistId],
    ])
      if (id)
        await page.request
          .delete(`http://127.0.0.1:5102/api/admin/${entity}/${id}`, { headers })
          .catch(() => undefined);
  }
});

test("registration and Mailpit password recovery complete through the public UI", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const username = `browserrecover${Date.now()}`;
  const account = {
    username,
    email: `${username}@example.test`,
    password: `Register!Aa8${crypto.randomUUID()}`,
  };
  const replacement = `Reset!Aa8${crypto.randomUUID()}`;
  let userId = "";
  try {
    await page.goto("/register");
    await page.getByLabel("Username", { exact: true }).fill(account.username);
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByLabel("Confirm Password", { exact: true }).fill(account.password);
    const auth = page.waitForResponse(
      response =>
        response.url().endsWith("/api/auth/login") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Create Account", exact: true }).click();
    userId = (await (await auth).json()).user.id;
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.goto("/forgot-password");
    await page.getByLabel("Email Address", { exact: true }).fill(account.email);
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText(/if an account|check your email/i).first()).toBeVisible();
    let messageId = "";
    await expect
      .poll(async () => {
        const inbox = (await (
          await request.get("http://127.0.0.1:8025/api/v1/messages")
        ).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
        messageId =
          inbox.messages.find(message => message.To.some(to => to.Address === account.email))?.ID ||
          "";
        return Boolean(messageId);
      })
      .toBe(true);
    const captured = (await (
      await request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`)
    ).json()) as { Text: string; HTML: string };
    const resetLink = (captured.Text.match(/http:\/\/127\.0\.0\.1:3100\/reset-password[^\s<>]+/) ||
      captured.HTML.match(/http:\/\/127\.0\.0\.1:3100\/reset-password[^\s"<>]+/))?.[0].replaceAll(
      "&amp;",
      "&"
    );
    if (!resetLink) throw new Error("Local capture did not contain a reset link");
    await page.goto(resetLink).catch(() => {
      throw new Error("Unable to open captured reset page");
    });
    await page.getByLabel("New password", { exact: true }).fill(replacement);
    await page.getByLabel("Confirm new password", { exact: true }).fill(replacement);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Password updated" })).toBeVisible();
    expect(
      (
        await request.post("http://127.0.0.1:5101/api/auth/login", {
          headers: { "X-Spotibuds-Request": "1" },
          data: { username, password: account.password },
        })
      ).status()
    ).toBe(401);
    await login(page, { ...account, password: replacement });
    await page.goto(resetLink).catch(() => {
      throw new Error("Unable to open used reset page");
    });
    await page.getByLabel("New password", { exact: true }).fill(`${replacement}Again`);
    await page.getByLabel("Confirm new password", { exact: true }).fill(`${replacement}Again`);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /invalid|expired|used/i })
    ).toBeVisible();
  } finally {
    if (userId) {
      const admin = accounts.find(account => account.username === "demoadmin")!;
      const auth = (await (
        await request.post("http://127.0.0.1:5101/api/auth/login", {
          headers: { "X-Spotibuds-Request": "1" },
          data: { username: admin.username, password: admin.password },
        })
      ).json()) as { token: string };
      await request.delete(`http://127.0.0.1:5101/api/auth/users/${userId}`, {
        headers: { Authorization: `Bearer ${auth.token}`, "X-Spotibuds-Request": "1" },
      });
    }
  }
});

test("now-playing feed reaction persists after reload and remains on the history post", async ({
  page,
  request,
}) => {
  const aliceSession = (await (
    await request.post("http://127.0.0.1:5101/api/auth/login", {
      headers: { "X-Spotibuds-Request": "1" },
      data: { username: alice.username, password: alice.password },
    })
  ).json()) as { token: string; user: { id: string } };
  const headers = { Authorization: `Bearer ${aliceSession.token}`, "X-Spotibuds-Request": "1" };
  expect(
    (
      await request.post("http://127.0.0.1:5103/api/feed/nowplaying", {
        headers,
        data: {
          identityUserId: aliceSession.user.id,
          songId: fixtures.songIds[0],
          positionSec: 1,
          isPlaying: true,
        },
      })
    ).ok()
  ).toBe(true);
  const bob = await login(page, accounts.find(account => account.username === "bob")!);
  const bobHeaders = { Authorization: `Bearer ${bob.token}`, "X-Spotibuds-Request": "1" };
  const postId = `nowplaying:${aliceSession.user.id}:${fixtures.songIds[0]}`;
  const reactions = async () => {
    const result = await page.request.get(
      `http://127.0.0.1:5103/api/feed/reactions/by-post?postId=${encodeURIComponent(postId)}`,
      { headers: bobHeaders }
    );
    expect(result.status(), "Synthetic now-playing reaction read").toBe(200);
    return result;
  };
  let savedPostId = "";
  const initial = (await (await reactions()).json()) as {
    emoji: string;
    fromIdentityUserId: string;
  }[];
  if (
    initial.some(reaction => reaction.emoji === "❤️" && reaction.fromIdentityUserId === bob.user.id)
  )
    await page.request.post("http://127.0.0.1:5103/api/feed/reactions", {
      headers: bobHeaders,
      data: {
        postId,
        emoji: "❤️",
        contextType: "now_playing",
        songId: fixtures.songIds[0],
        toIdentityUserId: aliceSession.user.id,
      },
    });
  try {
    await page.goto("/feed");
    let live = page.locator(`section[data-feed-post-id="${postId}"]`);
    await live.scrollIntoViewIfNeeded();
    await expect(live.getByRole("button", { name: "Add ❤️ reaction", exact: true })).toBeEnabled();
    const response = page.waitForResponse(
      response =>
        response.url().endsWith("/api/feed/reactions") && response.request().method() === "POST"
    );
    await live.getByRole("button", { name: "Add ❤️ reaction", exact: true }).click();
    const acknowledgement = await response;
    expect(acknowledgement.ok()).toBe(true);
    savedPostId = ((await acknowledgement.json()) as { postId: string }).postId;
    await expect(
      live.getByRole("button", { name: "Remove ❤️ reaction", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    live = page.locator(`section[data-feed-post-id="${postId}"]`);
    await live.scrollIntoViewIfNeeded();
    await expect(
      live.getByRole("button", { name: "Remove ❤️ reaction", exact: true })
    ).toBeVisible();
    const persisted = (await (await reactions()).json()) as {
      emoji: string;
      fromIdentityUserId: string;
      postId: string;
    }[];
    savedPostId = persisted.find(
      reaction => reaction.emoji === "❤️" && reaction.fromIdentityUserId === bob.user.id
    )!.postId;
    expect(
      persisted.filter(
        reaction => reaction.emoji === "❤️" && reaction.fromIdentityUserId === bob.user.id
      )
    ).toHaveLength(1);
    await request.delete(`http://127.0.0.1:5103/api/feed/nowplaying/${aliceSession.user.id}`, {
      headers,
    });
    await page.reload();
    await expect(page.locator(`section[data-feed-post-id="${postId}"]`)).toHaveCount(0);
    const historySlides = (await (
      await page.request.get(
        `http://127.0.0.1:5103/api/feed/slides?identityUserId=${bob.user.id}&limit=50&skip=0`,
        { headers: bobHeaders }
      )
    ).json()) as { postId: string; type: string; songId?: string; identityUserId: string }[];
    expect(
      historySlides.some(
        slide =>
          slide.postId === savedPostId &&
          slide.type === "recent_song" &&
          slide.songId === fixtures.songIds[0] &&
          slide.identityUserId === aliceSession.user.id
      )
    ).toBe(true);
    // Weekly aggregate cards may contain the same song and are shuffled beside
    // recent posts. The reaction belongs to the persisted recent-song post.
    const history = page.locator(`section[data-feed-post-id="${savedPostId}"]`);
    await expect(history).toHaveCount(1);
    await history.scrollIntoViewIfNeeded();
    await expect(
      history.getByRole("button", { name: "Remove ❤️ reaction", exact: true })
    ).toBeVisible();
    const post = await page.request.get(
      `http://127.0.0.1:5103/api/feed/reactions/by-post?postId=${persisted.find(reaction => reaction.emoji === "❤️" && reaction.fromIdentityUserId === bob.user.id)!.postId}`,
      { headers: bobHeaders }
    );
    expect(
      ((await post.json()) as { emoji: string }[]).some(reaction => reaction.emoji === "❤️")
    ).toBe(true);
  } finally {
    await request.delete(`http://127.0.0.1:5103/api/feed/nowplaying/${aliceSession.user.id}`, {
      headers,
    });
    if (savedPostId) {
      const cleanupResponse = await page.request.get(
        `http://127.0.0.1:5103/api/feed/reactions/by-post?postId=${encodeURIComponent(savedPostId)}`,
        { headers: bobHeaders }
      );
      expect(cleanupResponse.status(), "Canonical reaction cleanup read").toBe(200);
      const state = (await cleanupResponse.json()) as {
        emoji: string;
        fromIdentityUserId: string;
        postId: string;
      }[];
      const own = state.find(
        reaction => reaction.emoji === "❤️" && reaction.fromIdentityUserId === bob.user.id
      );
      if (own)
        await page.request.post("http://127.0.0.1:5103/api/feed/reactions", {
          headers: bobHeaders,
          data: {
            postId: own.postId,
            emoji: "❤️",
            contextType: "recent_song",
            toIdentityUserId: aliceSession.user.id,
          },
        });
    }
  }
});

test("notification read outage stays visible and a successful retry persists", async ({
  page,
  request,
}) => {
  const session = await login(page);
  const headers = { Authorization: `Bearer ${session.token}`, "X-Spotibuds-Request": "1" };
  const mallory = accounts.find(account => account.username === "mallory")!;
  const other = (await (
    await request.post("http://127.0.0.1:5101/api/auth/login", {
      headers: { "X-Spotibuds-Request": "1" },
      data: { username: mallory.username, password: mallory.password },
    })
  ).json()) as { token: string; user: { id: string } };
  const otherHeaders = { Authorization: `Bearer ${other.token}`, "X-Spotibuds-Request": "1" };
  const chat = (await (
    await request.post("http://127.0.0.1:5103/api/chats/create-or-get", {
      headers: otherHeaders,
      data: { participantIds: [session.user.id, other.user.id], isGroup: false },
    })
  ).json()) as { chatId: string };
  try {
    expect(
      (
        await request.post(`http://127.0.0.1:5103/api/chats/${chat.chatId}/messages`, {
          headers: otherHeaders,
          data: { content: `Notification read fixture ${Date.now()}` },
        })
      ).ok()
    ).toBe(true);
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    const mark = page.getByRole("button", { name: "Mark all read", exact: true });
    await expect(mark).toBeVisible();
    await page.route("**/api/notifications/*/read-all", route =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Controlled notification outage" }),
      })
    );
    await mark.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Controlled notification outage" })
    ).toBeVisible();
    await expect(mark).toBeVisible();
    await page.unroute("**/api/notifications/*/read-all");
    await mark.click();
    await expect(mark).toHaveCount(0);
    await page.reload();
    const state = (await (
      await page.request.get(`http://127.0.0.1:5103/api/notifications/${session.user.id}`, {
        headers,
      })
    ).json()) as { unreadCount: number };
    expect(state.unreadCount).toBe(0);
  } finally {
    await page.request.delete(`http://127.0.0.1:5103/api/chats/${chat.chatId}`, { headers });
  }
});

test("two ordinary users follow, unfollow, accept friendship, open a profile chat and remove friendship", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const suffix = Date.now();
  const ordinary = [0, 1].map(index => ({
    username: `browsersocial${suffix}${index}`,
    email: `browsersocial${suffix}${index}@example.test`,
    password: `Social!Aa8${crypto.randomUUID()}`,
  }));
  const second = await browser.newContext();
  const otherPage = await second.newPage();
  const ids: string[] = [];
  let chatId = "";
  let actorToken = "";
  try {
    for (const account of ordinary)
      expect(
        (
          await request.post("http://127.0.0.1:5101/api/auth/register", {
            headers: { "X-Spotibuds-Request": "1" },
            data: { ...account, isPrivate: false },
          })
        ).status()
      ).toBe(200);
    const actor = await login(page, ordinary[0]);
    ids.push(actor.user.id);
    actorToken = actor.token;
    const recipient = await login(otherPage, ordinary[1]);
    ids.push(recipient.user.id);
    const headers = { Authorization: `Bearer ${actor.token}`, "X-Spotibuds-Request": "1" };
    const follows = () =>
      page.request.get(
        `http://127.0.0.1:5103/api/follows/check?followerId=${actor.user.id}&followedId=${recipient.user.id}`,
        { headers }
      );
    await page.goto(`/user/${recipient.user.id}`);
    await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unfollow", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await (await follows()).json()).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Unfollow", exact: true }).click();
    await expect(page.getByRole("button", { name: "Follow", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(await (await follows()).json()).toBe(false);
    await page.getByRole("button", { name: "Add Friend", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Friend Request Sent", exact: true })
    ).toBeVisible();
    await otherPage.goto(`http://127.0.0.1:3100/user/${actor.user.id}`);
    await otherPage.getByRole("button", { name: "Accept Request", exact: true }).click();
    await expect(
      otherPage.getByRole("button", { name: "Remove Friend", exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove Friend", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}$/);
    chatId = page.url().split("/").at(-1)!;
    const persisted = await page.request.get(`http://127.0.0.1:5103/api/chats/${chatId}`, {
      headers,
    });
    expect(persisted.ok()).toBe(true);
    expect(((await persisted.json()) as { participants: string[] }).participants.sort()).toEqual(
      [...ids].sort()
    );
    await expect(
      page.getByRole("heading", { name: ordinary[1].username, exact: true })
    ).toBeVisible();
    await page.goto(`/user/${recipient.user.id}`);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Remove Friend", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add Friend", exact: true })).toBeVisible();
    await otherPage.reload();
    await expect(otherPage.getByRole("button", { name: "Add Friend", exact: true })).toBeVisible();
  } finally {
    if (chatId)
      await request.delete(`http://127.0.0.1:5103/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${actorToken}`, "X-Spotibuds-Request": "1" },
      });
    await second.close();
    const admin = accounts.find(account => account.username === "demoadmin")!;
    const auth = (await (
      await request.post("http://127.0.0.1:5101/api/auth/login", {
        headers: { "X-Spotibuds-Request": "1" },
        data: { username: admin.username, password: admin.password },
      })
    ).json()) as { token: string };
    for (const id of ids)
      await request.delete(`http://127.0.0.1:5101/api/auth/users/${id}`, {
        headers: { Authorization: `Bearer ${auth.token}`, "X-Spotibuds-Request": "1" },
      });
  }
});

test("hard navigation survives lost prepare cookies and lost completion bodies without replaying consumed credentials", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  for (const phase of ["prepare", "complete"] as const) {
    const session = await login(page);
    const original = (await context.cookies("http://127.0.0.1:5101/api/auth/refresh")).filter(
      cookie => cookie.name === "spotibuds.refresh"
    );
    // Cookie values stay only in test memory; no traces, screenshots or header dumps.
    expect(original.length === 1).toBe(true);
    const pattern = `**/api/auth/refresh/${phase}`;
    let intercepted = false;
    let serverFinished = false;
    let interceptionFailed = false;
    let operationId = "";
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(pattern, async route => {
      if (intercepted) {
        await route.continue();
        return;
      }
      intercepted = true;
      try {
        operationId = route.request().headers()["x-spotibuds-refresh-request"] || "";
        const response = await route.fetch({ timeout: 10000 });
        if (response.status() !== (phase === "prepare" ? 204 : 200))
          throw new Error("Unexpected refresh phase status");
        if (phase === "prepare") {
          // route.fetch shares the cookie jar. Restore the predecessor to model
          // a departed document that never received the prepared Set-Cookie.
          await context.addCookies(original);
        } else if (response.headers()["set-cookie"] !== undefined) {
          throw new Error("Completion must not mutate the installed cookie");
        }
        serverFinished = true;
        await held;
        await route.abort("aborted").catch(() => undefined);
      } catch {
        interceptionFailed = true;
        await route.abort("aborted").catch(() => undefined);
      }
    });
    try {
      await page.goto("/friends", { waitUntil: "domcontentloaded" });
      await expect.poll(() => serverFinished || interceptionFailed, { timeout: 15000 }).toBe(true);
      expect(interceptionFailed).toBe(false);
      expect(/^[0-9a-f-]{36}$/i.test(operationId)).toBe(true);
      expect(
        await page.evaluate(id => {
          const marker = JSON.parse(localStorage.getItem("spotibuds:refresh-operation") || "null");
          return marker?.id === id && Object.keys(marker).sort().join(",") === "id,startedAt";
        }, operationId)
      ).toBe(true);
      // Destroy the waiting document, then resume the same bounded operation.
      await page.goto("/playlists", { waitUntil: "domcontentloaded" });
      release();
      await expect(page.getByRole("heading", { name: "My Playlists", exact: true })).toBeVisible();
      await expect(page.getByText("Demo Favorites", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("spotibuds:refresh-operation")))
        .toBeNull();
      expect(
        await page.evaluate(() => JSON.parse(localStorage.getItem("currentUser") || "null")?.id)
      ).toBe(session.user.id);
      const recovered = (await context.cookies("http://127.0.0.1:5101/api/auth/refresh")).find(
        cookie => cookie.name === "spotibuds.refresh"
      );
      expect(Boolean(recovered?.httpOnly && recovered.value !== original[0].value)).toBe(true);
      await page.reload();
      await expect(page.getByText("Demo Favorites", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => [
          localStorage.getItem("token"),
          localStorage.getItem("refreshToken"),
        ])
      ).toEqual([null, null]);
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      // Persisted sign-out intent prevents public cookie bootstrap, and the
      // completed operation cannot survive logout.
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("spotibuds:refresh-operation")))
        .toBeNull();
      expect(await page.evaluate(() => localStorage.getItem("currentUser"))).toBeNull();
    } finally {
      release();
      await page.unroute(pattern);
    }
  }
});

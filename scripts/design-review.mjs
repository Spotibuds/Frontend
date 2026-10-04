import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

// Deliberately isolated REST fixtures: this review makes no live persistence or
// SignalR delivery claims. Unknown requests fail visibly and are reported.
const base = process.env.REVIEW_BASE_URL || "http://127.0.0.1:3100";
const output = path.resolve(".impeccable/review", process.env.REVIEW_RUN || "initial");
await mkdir(output, { recursive: true });
const now = new Date().toISOString();
const me = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "alex",
  displayName: "Alex Morgan",
  email: "alex@example.test",
  roles: ["User", "Admin"],
  isPrivate: false,
};
const friendId = "22222222-2222-4222-8222-222222222222";
const songs = Array.from({ length: 8 }, (_, i) => ({
  id: (i + 1).toString(16).padStart(24, "0"),
  title: [
    "Midnight City",
    "A beautifully long song title that should remain within its row",
    "Northern Lights",
    "Home Again",
    "Open Water",
    "After Hours",
    "Quiet Streets",
    "First Light",
  ][i],
  artists: [{ id: "artist-1", name: "The Night Collective" }],
  durationSec: 185 + i * 22,
  album: { id: "album-1", title: "Night Sessions" },
  genre: "Electronic",
  createdAt: now,
  releaseDate: "2026-09-01",
}));
const artists = [
  {
    id: "artist-1",
    name: "The Night Collective",
    bio: "Music for late nights and new beginnings.",
    createdAt: now,
  },
  { id: "artist-2", name: "Ellis River", bio: "Independent songwriter.", createdAt: now },
];
const albums = [
  {
    id: "album-1",
    title: "Night Sessions",
    artist: { id: "artist-1", name: "The Night Collective" },
    songs: songs.slice(0, 4).map((song, position) => ({ id: song.id, position, addedAt: now })),
    createdAt: now,
    releaseDate: "2026-09-01",
  },
  {
    id: "album-2",
    title: "Places We Remember",
    artist: { id: "artist-2", name: "Ellis River" },
    songs: [],
    createdAt: now,
    releaseDate: "2026-08-15",
  },
];
const lists = [
  {
    id: "playlist-1",
    name: "Late night listening",
    description: "A few favorites for the journey home.",
    createdBy: me.id,
    isPublic: false,
    songs: songs.slice(0, 3).map((song, position) => ({ ...song, position, addedAt: now })),
    songCount: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "liked-1",
    name: "Liked Songs",
    createdBy: me.id,
    isPublic: false,
    songs: [{ ...songs[0], position: 0, addedAt: now }],
    songCount: 1,
    createdAt: now,
    updatedAt: now,
  },
];
const profiles = [
  me,
  {
    id: friendId,
    username: "river",
    displayName: "River Chen",
    email: "river@example.test",
    roles: ["User"],
  },
].map(user => ({
  ...user,
  identityUserId: user.id,
  userName: user.username,
  bio: "Always looking for the next great song.",
  followers: [friendId],
  followedUsers: [friendId],
  playlists: [{ id: "playlist-1" }],
  createdAt: now,
}));
const history = songs.slice(0, 4).map(song => ({
  songId: song.id,
  songTitle: song.title,
  artist: song.artists[0].name,
  duration: song.durationSec,
  playedAt: now,
}));
const post = {
  postId: "post-1",
  id: "post-1",
  type: "recent_song",
  identityUserId: friendId,
  username: "river",
  displayName: "River Chen",
  songId: songs[0].id,
  songTitle: songs[0].title,
  artist: songs[0].artists[0].name,
  playedAt: now,
};
const chat = {
  chatId: "444444444444444444444444",
  isGroup: false,
  participants: [me.id, friendId],
  lastActivity: now,
  lastMessageContent: "Have you heard this album?",
  lastMessageSenderId: friendId,
};
const notice = {
  id: "666666666666666666666666",
  type: "Message",
  status: "Unread",
  title: "New message from River",
  message: "Have you heard this album?",
  sourceUserId: friendId,
  targetUserId: me.id,
  actionUrl: "/chat/444444444444444444444444",
  data: { chatId: "444444444444444444444444" },
  createdAt: now,
  readAt: null,
};
const token = `e30.${Buffer.from(JSON.stringify({ sub: me.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const report = {
  scope: "Fixture-backed browser UI review; no live backend or media playback validation",
  base,
  routeInventory: [],
  routes: [],
  dialogs: [],
  flows: [],
  unknownRequests: [],
  pageErrors: [],
  transportErrors: [],
};
async function inventory(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      await inventory(path.join(directory, entry.name), `${prefix}/${entry.name}`);
    else if (entry.name === "page.tsx") report.routeInventory.push(prefix || "/");
  }
}
await inventory(path.resolve("src/app"));
report.routeInventory.sort();
const publicRoutes = new Set(["/", "/register", "/forgot-password", "/reset-password"]);
const resolveRoute = route =>
  route
    .replace("/user/[id]", `/user/${friendId}`)
    .replace("/artist/[id]", "/artist/artist-1")
    .replace("/album/[id]", "/album/album-1")
    .replace("/playlists/[id]", "/playlists/playlist-1")
    .replace("/playlist/[id]", "/playlist/playlist-1")
    .replace("/chat/[id]", "/chat/444444444444444444444444")
    .replace("/feed/post/[id]", "/feed/post/post-1")
    .replace("/post/[id]", "/post/post-1");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.REVIEW_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
async function fixtureContext(authenticated, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  context.setDefaultTimeout(6000);
  let active = authenticated;
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname;
    if (url.origin === base && !p.startsWith("/api/")) return route.continue();
    if (p.includes("/hubs/") || /-hub(?:\/|$)/.test(p)) {
      report.transportErrors.push({
        method: request.method(),
        path: p,
        exclusion: "SignalR backend unavailable; REST fixtures only",
      });
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "SignalR is outside fixture scope" }),
      });
    }
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
        headers: {
          "access-control-allow-origin": base,
          "access-control-allow-credentials": "true",
        },
      });
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": base,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "*",
        },
      });
    if (p.endsWith("/auth/refresh/prepare")) return route.fulfill({ status: active ? 204 : 401 });
    if (p.endsWith("/auth/refresh/complete") || p.endsWith("/auth/login"))
      return json(
        active ? { token, user: me } : { message: "Signed out fixture" },
        active ? 200 : 401
      );
    if (p.endsWith("/auth/logout")) {
      active = false;
      return route.fulfill({ status: 204 });
    }
    if (/\/auth\/(users|admins)$/.test(p))
      return json({
        users: profiles.filter(user => !p.endsWith("admins") || user.roles.includes("Admin")),
        totalCount: profiles.length,
      });
    if (p === "/api/songs") return json(songs);
    if (/^\/api\/songs\//.test(p))
      return json(songs.find(song => song.id === p.split("/").at(-1)) || songs[0]);
    if (p === "/api/albums") return json(albums);
    if (/^\/api\/albums\/[^/]+\/songs$/.test(p)) return json(songs.slice(0, 4));
    if (/^\/api\/albums\//.test(p))
      return json(albums.find(album => album.id === p.split("/").at(-1)) || albums[0]);
    if (p === "/api/artists") return json(artists);
    if (/^\/api\/artists\/[^/]+\/albums$/.test(p)) return json(albums);
    if (/^\/api\/artists\/[^/]+\/songs$/.test(p)) return json(songs);
    if (/^\/api\/artists\//.test(p)) return json(artists[0]);
    if (p === "/api/search") return json({ songs, albums, artists, playlists: lists });
    if (/^\/api\/playlists\/user\//.test(p)) {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        const item = { ...lists[0], ...body, id: `new-${lists.length}`, songs: [], songCount: 0 };
        lists.push(item);
        return json(item, 201);
      }
      return json(lists);
    }
    if (/^\/api\/playlists\/[^/]+\/songs\//.test(p)) {
      const item = lists.find(list => list.id === p.split("/")[3]);
      const songId = p.split("/").at(-1);
      if (item && request.method() === "POST" && !item.songs.some(song => song.id === songId))
        item.songs.push({
          ...songs.find(song => song.id === songId),
          position: item.songs.length,
          addedAt: now,
        });
      if (item && request.method() === "DELETE")
        item.songs = item.songs.filter(song => song.id !== songId);
      if (item) item.songCount = item.songs.length;
      return route.fulfill({ status: 204 });
    }
    if (/^\/api\/playlists\/[^/]+$/.test(p)) {
      const item = lists.find(list => list.id === p.split("/").at(-1));
      if (!item) return json({ message: "Fixture playlist not found" }, 404);
      if (request.method() === "PUT") Object.assign(item, request.postDataJSON());
      return json(item);
    }
    if (p.includes("/listening-history")) return json(request.method() === "POST" ? {} : history);
    if (p.includes("/top-artists/")) return json([{ name: artists[0].name, count: 4 }]);
    if (p === "/api/users/batch")
      return json(
        profiles.filter(profile => request.postDataJSON().userIds.includes(profile.identityUserId))
      );
    if (p === "/api/users" || p === "/api/users/search") return json(profiles);
    if (/^\/api\/users\//.test(p))
      return json(
        profiles.find(profile => profile.identityUserId === p.split("/").at(-1)) || profiles[0]
      );
    if (p === "/api/friends/status")
      return json({
        status: "accepted",
        friendshipId: "friendship-1",
        requesterId: me.id,
        addresseeId: friendId,
      });
    if (/^\/api\/friends\/(pending|sent)\//.test(p)) return json([]);
    if (/^\/api\/friends\//.test(p)) return json([friendId]);
    if (/\/follows\/.+\/stats$/.test(p)) return json({ followers: 1, following: 1 });
    if (p === "/api/follows/check") return json(false);
    if (p.startsWith("/api/follows/")) return json([friendId]);
    if (p === "/api/chats/unread-counts") return json({ [chat.chatId]: 1 });
    if (p.startsWith("/api/chats/user/")) return json([chat]);
    if (p.endsWith("/unread-count")) return json(1);
    if (p.endsWith("/mark-all-read")) return json({ message: "Read" });
    if (p.includes("/chats/") && p.endsWith("/messages"))
      return json([
        {
          messageId: "555555555555555555555555",
          chatId: chat.chatId,
          senderId: friendId,
          senderName: "River",
          content: chat.lastMessageContent,
          type: "text",
          sentAt: now,
          isEdited: false,
          readBy: [],
        },
      ]);
    if (p.startsWith("/api/chats/")) return json(chat);
    if (p.startsWith("/api/notifications/"))
      return json({ notifications: [notice], unreadCount: 1, totalCount: 1, nextBefore: null });
    if (p.endsWith("/feed/slides/page"))
      return json({ items: [post], nextCursor: null, hasMore: false });
    if (p.endsWith("/feed/slides")) return json([post]);
    if (p.endsWith("/feed/post")) return json(post);
    if (p.endsWith("/feed/reactions/summary"))
      return json({
        postId: post.postId,
        total: 1,
        counts: [{ emoji: "❤️", count: 1 }],
        myEmojis: [],
      });
    if (p.endsWith("/feed/reactions/people"))
      return json({ items: [], total: 0, nextCursor: null, hasMore: false });
    if (p.includes("/feed/reactions/")) return json([]);
    if (p.includes("/feed/nowplaying/batch")) return json([]);
    if (p.includes("/feed/nowplaying")) return json(request.method() === "POST" ? {} : []);
    report.unknownRequests.push({
      method: request.method(),
      path: p,
      page: request.frame()?.url(),
    });
    return json({ message: `Missing browser review fixture: ${p}` }, 501);
  });
  return context;
}
async function geometry(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll("body *")];
    const overflow = elements
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          (rect.right > width + 1 || rect.left < -1) &&
          !element.closest('[aria-hidden="true"]')
        );
      })
      .slice(0, 12)
      .map(element => ({
        tag: element.tagName,
        text: (element.textContent || "").trim().slice(0, 80),
        class: element.className,
        right: Math.round(element.getBoundingClientRect().right),
      }));
    return {
      viewportWidth: width,
      scrollWidth: document.documentElement.scrollWidth,
      overflow,
      heading: document.querySelector("h1")?.textContent,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(element =>
        element.textContent?.trim()
      ),
      unnamedButtons: [...document.querySelectorAll("button")].filter(
        element =>
          element.getClientRects().length &&
          !element.textContent.trim() &&
          !element.getAttribute("aria-label") &&
          !element.getAttribute("title")
      ).length,
    };
  });
}
async function visit(page, route, width, authenticated, options = {}) {
  const slug = route.replace(/[^a-z0-9-]/gi, "-").replace(/^-|-$/g, "") || "login";
  const screenshot = path.join(
    output,
    `${width}-${slug}${options.filter ? `-${options.filter.toLowerCase()}` : ""}.png`
  );
  const item = {
    route,
    width,
    authenticated,
    screenshot,
    ...(options.filter ? { view: options.filter } : {}),
  };
  try {
    await page.goto(
      `${base}${route}${route === "/search" ? "?q=night" : route === "/reset-password" ? "?email=alex%40example.test&token=fixture" : ""}`,
      { waitUntil: "networkidle", timeout: 45000 }
    );
    await page.locator("body").waitFor();
    if (options.filter)
      await page
        .getByRole("button", { name: new RegExp(`^${options.filter}`, "i") })
        .first()
        .click();
    item.finalPath = new URL(page.url()).pathname;
    Object.assign(item, await geometry(page));
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
  } catch (error) {
    item.error = error.message;
  }
  report.routes.push(item);
  console.log(
    `route ${width} ${route}: ${item.error ? "ERROR" : item.scrollWidth > width ? "OVERFLOW" : "captured"}`
  );
}
async function dialogReview(page, route, triggerName, title, width, options = {}) {
  const item = { route, triggerName: String(triggerName), title, width };
  try {
    await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 45000 });
    if (options.filter)
      await page
        .getByRole("button", { name: new RegExp(`^${options.filter}`, "i") })
        .first()
        .click();
    const playerTrigger = page.getByRole("button", { name: "Open music player", exact: true });
    const mobileQueue = title === "Up next" && width < 768;
    if (mobileQueue) await playerTrigger.click();
    const trigger = page
      .getByRole("button", {
        name: mobileQueue ? /^Queue \(/ : triggerName,
        exact: typeof triggerName === "string",
      })
      .first();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await dialog
      .locator("button:visible, input:visible, a[href]:visible")
      .first()
      .waitFor({ state: "visible", timeout: 5000 });
    item.initialFocusInside = await dialog.evaluate(element =>
      element.contains(document.activeElement)
    );
    if (["Navigation", "Song editor", "Artist editor"].includes(title))
      item.toastLayering = await dialog.evaluate(element => {
        const toast = document.querySelector('[class*="fixed top-20 right-4"]');
        let dialogLayer = 0;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement)
          dialogLayer = Math.max(dialogLayer, Number(getComputedStyle(ancestor).zIndex) || 0);
        const toastLayer = toast ? Number(getComputedStyle(toast).zIndex) || 0 : 0;
        return { dialogLayer, toastLayer, dialogAboveToast: dialogLayer > toastLayer };
      });
    item.backgroundBlocked = await page.evaluate(() =>
      [...document.querySelectorAll('body [inert], body [aria-hidden="true"]')].some(element =>
        element.querySelector("main, nav, .page-shell")
      )
    );
    item.geometry = await geometry(page);
    item.screenshot = path.join(
      output,
      `${width}-dialog-${title.toLowerCase().replace(/\W+/g, "-")}-${String(triggerName).toLowerCase().replace(/\W+/g, "-").slice(0, 35)}${title === "Are you sure?" ? route.replaceAll("/", "-") : ""}.png`
    );
    await page.screenshot({ path: item.screenshot, animations: "disabled" });
    await page.keyboard.press("Shift+Tab");
    item.shiftTabFocusInside = await dialog.evaluate(element =>
      element.contains(document.activeElement)
    );
    for (let i = 0; i < 18; i++) await page.keyboard.press("Tab");
    item.tabFocusInside = await dialog.evaluate(element =>
      element.contains(document.activeElement)
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5000 });
    item.escapeCloses = true;
    await expect(mobileQueue ? playerTrigger : trigger).toBeFocused({ timeout: 2000 });
    item.focusRestored = true;
  } catch (error) {
    item.error = error.message;
  }
  report.dialogs.push(item);
  console.log(`dialog ${width} ${title}: ${item.error || "checked"}`);
}
async function notificationDropdownReview(page, width) {
  const item = { route: "/music", title: "Notification inbox", width, kind: "nonmodal region" };
  try {
    await page.goto(`${base}/music`, { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: "Notifications", exact: true });
    await trigger.click();
    const panel = page.getByRole("region", { name: "Notification inbox", exact: true });
    await panel.waitFor({ state: "visible" });
    item.initialFocusInside = await panel.evaluate(element =>
      element.contains(document.activeElement)
    );
    item.obscuredControls = await panel.evaluate(element =>
      [...element.querySelectorAll("h2, button, a[href]")]
        .filter(control => {
          const rect = control.getBoundingClientRect();
          if (!rect.width || !rect.height || rect.top < 0 || rect.bottom > innerHeight)
            return false;
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          return hit && !control.contains(hit) && !hit.contains(control);
        })
        .map(control => control.getAttribute("aria-label") || control.textContent.trim())
    );
    item.geometry = await geometry(page);
    item.screenshot = path.join(output, `${width}-notification-inbox.png`);
    await page.screenshot({ path: item.screenshot });
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    await expect(trigger).toBeFocused();
    item.escapeCloses = true;
    item.focusRestored = true;
  } catch (error) {
    item.error = error.message;
  }
  report.flows.push(item);
}
async function musicFlows(page, width) {
  const item = {
    width,
    scope: "Fixture-backed favorite, add-to-playlist, edit and queue UI transitions",
  };
  try {
    await page.goto(`${base}/music`, { waitUntil: "networkidle" });
    const saveName = `Save ${songs[2].title} to Liked Songs`;
    const removeName = `Remove ${songs[2].title} from Liked Songs`;
    await page.getByRole("button", { name: saveName, exact: true }).click();
    await expect(page.getByRole("button", { name: removeName, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: removeName, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    item.favoriteReload = true;
    await page.getByRole("button", { name: removeName, exact: true }).click();
    await expect(page.getByRole("button", { name: saveName, exact: true })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    item.favoriteRemove = true;
    await page
      .getByRole("button", { name: `Add ${songs[3].title} to playlist`, exact: true })
      .click();
    const addDialog = page.getByRole("dialog", { name: "Add to playlist", exact: true });
    await addDialog.getByRole("button", { name: /Late night listening/ }).click();
    await addDialog.waitFor({ state: "detached" });
    await page
      .getByRole("button", { name: `Add ${songs[3].title} to playlist`, exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Add to playlist", exact: true })
        .getByRole("button", { name: /Late night listening/ })
    ).toBeDisabled();
    item.alreadyAddedDisabled = true;
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: `Add ${songs[0].title} to queue`, exact: true }).click();
    if (width < 768) {
      await page.getByRole("button", { name: "Open music player", exact: true }).click();
      await page.getByRole("button", { name: /^Queue \(/ }).click();
    } else await page.getByRole("button", { name: /^Show queue/ }).click();
    const queueDialog = page.getByRole("dialog", { name: "Up next", exact: true });
    await expect(
      queueDialog.getByRole("button", { name: `Remove ${songs[0].title} from queue`, exact: true })
    ).toBeVisible();
    await queueDialog.getByRole("button", { name: "Clear queue", exact: true }).click();
    await expect(queueDialog.getByText("Your queue is empty", { exact: true })).toBeVisible();
    item.queueAddClear = true;
    await page.keyboard.press("Escape");
    await page.goto(`${base}/playlists/playlist-1`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Edit playlist", exact: true }).click();
    await page
      .getByLabel("Description (optional)", { exact: true })
      .fill("Edited fixture description");
    await page.getByRole("button", { name: "Save playlist", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Edit playlist", exact: true })
      .waitFor({ state: "detached" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Edited fixture description", { exact: true })).toBeVisible();
    item.playlistEditReload = true;
  } catch (error) {
    item.error = error.message;
  } finally {
    lists[0].description = "A few favorites for the journey home.";
    lists[0].songs = songs
      .slice(0, 3)
      .map((song, position) => ({ ...song, position, addedAt: now }));
    lists[0].songCount = 3;
    lists[1].songs = [{ ...songs[0], position: 0, addedAt: now }];
    lists[1].songCount = 1;
  }
  report.flows.push(item);
  console.log(`flows ${width}: ${item.error || "checked"}`);
}
try {
  for (const width of [1440, 390, 320]) {
    const contexts = new Map();
    for (const authenticated of [false, true])
      contexts.set(
        authenticated,
        await fixtureContext(authenticated, { width, height: width === 1440 ? 1000 : 844 })
      );
    for (const [authenticated, context] of contexts) {
      const page = await context.newPage();
      page.on("pageerror", error =>
        report.pageErrors.push({ width, page: page.url(), message: error.message })
      );
      if (process.env.REVIEW_PHASE === "last-corrections") {
        if (authenticated && width < 768) {
          await visit(page, "/search", width, true, { filter: "Songs" });
          if (width === 320) {
            await dialogReview(page, "/admin/songs", "Update", "Song editor", width);
            await dialogReview(page, "/admin/artists", "Update", "Artist editor", width);
            await dialogReview(page, "/admin/songs", "Delete", "Are you sure?", width);
          }
        }
        await context.close();
        continue;
      }
      if (process.env.REVIEW_PHASE === "confirmation") {
        if (authenticated)
          for (const route of ["/admin", "/admin/songs", "/admin/artists"])
            await dialogReview(page, route, "Delete", "Are you sure?", width);
        await context.close();
        continue;
      }
      if (process.env.REVIEW_PHASE === "final-corrections") {
        if (authenticated) {
          for (const route of ["/search", "/friends", "/admin/users"])
            await visit(page, route, width, true);
          await dialogReview(page, "/search?q=night", "Update", "Update album", width, {
            filter: "albums",
          });
          if (width === 320) {
            await dialogReview(page, "/admin/songs", "Create New Song", "Song editor", width);
            await dialogReview(page, "/admin/songs", "Update", "Song editor", width);
          }
          if (width < 768)
            await dialogReview(page, "/music", "Open navigation", "Navigation", width);
          await notificationDropdownReview(page, width);
        }
        await context.close();
        continue;
      }
      if (process.env.REVIEW_PHASE === "navigation") {
        if (authenticated) {
          if (width < 768)
            await dialogReview(page, "/music", "Open navigation", "Navigation", width);
          await notificationDropdownReview(page, width);
        }
        await context.close();
        continue;
      }
      if (process.env.REVIEW_PHASE === "remaining-dialogs") {
        if (authenticated && width !== 320) {
          for (const type of ["song", "album", "artist"])
            await dialogReview(page, "/search?q=night", "Update", `Update ${type}`, width, {
              filter: `${type}s`,
            });
          await dialogReview(
            page,
            "/album/album-1",
            "Add to playlist",
            "Add album to playlist",
            width
          );
          for (const route of ["/admin", "/admin/songs", "/admin/artists"])
            await dialogReview(page, route, "Delete", "Are you sure?", width);
        }
        await context.close();
        continue;
      }
      for (const template of report.routeInventory)
        if (!publicRoutes.has(template) === authenticated)
          await visit(page, resolveRoute(template), width, authenticated);
      if (authenticated) {
        await dialogReview(page, "/playlists", "Edit Late night listening", "Edit playlist", width);
        await dialogReview(
          page,
          "/playlists",
          "Delete Late night listening",
          "Delete playlist?",
          width
        );
        await dialogReview(page, "/playlists/playlist-1", "Edit playlist", "Edit playlist", width);
        await dialogReview(
          page,
          "/music",
          "Add Midnight City to playlist",
          "Add to playlist",
          width
        );
        await dialogReview(page, "/music", "Open music player", "Now playing", width);
        await dialogReview(page, "/music", /^Show queue/, "Up next", width);
        await dialogReview(page, "/admin/songs", "Create New Song", "Song editor", width);
        if (width !== 320) {
          await dialogReview(page, "/admin/songs", "Update", "Song editor", width);
          await dialogReview(page, "/admin", "Create New Album", "Album editor", width);
          await dialogReview(page, "/admin", "Update", "Album editor", width);
          await dialogReview(page, "/admin/artists", "Create New Artist", "Artist editor", width);
          await dialogReview(page, "/admin/artists", "Update", "Artist editor", width);
          for (const type of ["song", "album", "artist"])
            await dialogReview(page, "/search?q=night", "Update", `Update ${type}`, width, {
              filter: `${type}s`,
            });
          await dialogReview(
            page,
            "/album/album-1",
            "Add to playlist",
            "Add album to playlist",
            width
          );
          await dialogReview(page, `/user/${friendId}`, /^Friends \(/, "Friends", width);
          await dialogReview(
            page,
            `/user/${friendId}`,
            /^Public playlists \(/,
            "Public playlists",
            width
          );
          await dialogReview(page, "/friends", "Remove", "Remove friend?", width);
          for (const route of ["/admin", "/admin/songs", "/admin/artists"])
            await dialogReview(page, route, "Delete", "Are you sure?", width);
        }
        if (width < 768) await dialogReview(page, "/music", "Open navigation", "Navigation", width);
        await notificationDropdownReview(page, width);
        await musicFlows(page, width);
      }
      await context.close();
    }
  }
} finally {
  report.unknownRequests = [
    ...new Map(report.unknownRequests.map(item => [`${item.method}:${item.path}`, item])).values(),
  ];
  report.transportErrors = [
    ...new Map(report.transportErrors.map(item => [`${item.method}:${item.path}`, item])).values(),
  ];
  report.summary = {
    pageFiles: report.routeInventory.length,
    captures: report.routes.length,
    errors: report.routes.filter(item => item.error).length,
    overflowingRoutes: report.routes
      .filter(item => item.scrollWidth > item.width)
      .map(item => ({ route: item.route, width: item.width, scrollWidth: item.scrollWidth })),
    dialogFailures: report.dialogs.filter(
      item =>
        item.error ||
        !item.initialFocusInside ||
        !item.shiftTabFocusInside ||
        !item.tabFocusInside ||
        !item.escapeCloses ||
        !item.focusRestored ||
        item.backgroundBlocked === false ||
        item.toastLayering?.dialogAboveToast === false
    ),
    unknownRequests: report.unknownRequests.length,
    pageErrors: report.pageErrors.length,
    flowFailures: report.flows.filter(
      item =>
        item.error ||
        item.obscuredControls?.length ||
        (item.kind === "nonmodal region" &&
          (!item.initialFocusInside || !item.escapeCloses || !item.focusRestored))
    ),
  };
  await writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${path.join(output, "report.json")}`);
  if (
    report.summary.errors ||
    report.summary.overflowingRoutes.length ||
    report.summary.dialogFailures.length ||
    report.summary.unknownRequests ||
    report.summary.pageErrors ||
    report.summary.flowFailures.length
  )
    process.exitCode = 1;
}

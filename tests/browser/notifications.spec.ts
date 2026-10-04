import {
  test,
  expect,
  request as apiRequests,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";

type Account = { username: string; password: string; email: string };
type Session = { token: string; user: { id: string; roles: string[] } };
type Notice = {
  id: string;
  type: string;
  status: string;
  title: string;
  message: string;
  sourceUserId: string;
  targetUserId: string;
  actionUrl: string | null;
  data: { chatId?: string; requestId?: string; postId?: string };
  readAt: string | null;
};
type Snapshot = {
  notifications: Notice[];
  unreadCount: number;
  totalCount: number;
  nextBefore: string | null;
};
const identity = "http://127.0.0.1:5101";
const users = "http://127.0.0.1:5103";
const accounts = JSON.parse(
  readFileSync("demo/accounts.local.json", "utf8").replace(/^\uFEFF/, "")
) as Account[];
const fixtures = JSON.parse(
  readFileSync("demo/fixtures.local.json", "utf8").replace(/^\uFEFF/, "")
) as { songIds: string[] };
const auth = (session: Session) => ({
  Authorization: `Bearer ${session.token}`,
  "X-Spotibuds-Request": "1",
});
const row = (page: Page, id: string) => page.locator(`article[data-notification-id="${id}"]`);

async function apiLogin(request: APIRequestContext, account: Account): Promise<Session> {
  const response = await request.post(`${identity}/api/auth/login`, {
    headers: { "X-Spotibuds-Request": "1" },
    data: { username: account.username, password: account.password },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Session>;
}
async function login(page: Page, account: Account) {
  if (page.url() !== "http://127.0.0.1:3100/") await page.goto("http://127.0.0.1:3100/");
  await page.getByLabel("Username", { exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function pair(request: APIRequestContext, createdIds: string[]) {
  const suffix = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
  const members = [0, 1].map(index => ({
    username: `notice${suffix}${index}`,
    email: `notice${suffix}${index}@example.test`,
    password: `Fixture!Aa8${crypto.randomUUID()}`,
  }));
  const sessions: Session[] = [];
  for (const member of members) {
    const registered = await request.post(`${identity}/api/auth/register`, {
      headers: { "X-Spotibuds-Request": "1" },
      data: { ...member, isPrivate: false },
    });
    if (registered.status() === 200 || registered.status() === 503) {
      const result = (await registered.json()) as { userId?: string };
      if (result.userId && /^[a-f0-9-]{36}$/i.test(result.userId)) createdIds.push(result.userId);
    }
    expect(registered.status()).toBe(200);
    const isolated = await apiRequests.newContext();
    try {
      const session = await apiLogin(isolated, member);
      expect(session.user.roles).toEqual(["User"]);
      sessions.push(session);
    } finally {
      await isolated.dispose();
    }
  }
  return { members, sessions };
}
async function cleanup(createdIds: string[]) {
  // A timed-out browser fixture can close its request context before finally.
  // This independently owned context still removes the exact ordinary accounts.
  if (createdIds.length === 0) return;
  const request = await apiRequests.newContext();
  try {
    const admin = await apiLogin(
      request,
      accounts.find(account => account.username === "demoadmin")!
    );
    for (const userId of createdIds) {
      expect(
        (
          await request.delete(`${identity}/api/auth/users/${userId}`, {
            headers: auth(admin),
          })
        ).status()
      ).toBe(204);
      expect(
        (
          await request.get(`${identity}/api/auth/users/${userId}`, {
            headers: auth(admin),
          })
        ).status()
      ).toBe(404);
      expect(
        (await request.get(`${users}/api/users/${userId}`, { headers: auth(admin) })).status()
      ).toBe(404);
    }
    expect(
      (await request.post(`${identity}/api/auth/logout`, { headers: auth(admin) })).status()
    ).toBe(204);
  } finally {
    await request.dispose();
  }
}
async function snapshot(
  request: APIRequestContext,
  session: Session,
  query = ""
): Promise<Snapshot> {
  const response = await request.get(`${users}/api/notifications/${session.user.id}${query}`, {
    headers: auth(session),
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Snapshot>;
}
async function createChat(request: APIRequestContext, sessions: Session[]) {
  const response = await request.post(`${users}/api/chats/create-or-get`, {
    headers: auth(sessions[0]),
    data: { participantIds: sessions.map(session => session.user.id) },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { chatId: string }).chatId;
}
async function send(
  request: APIRequestContext,
  session: Session,
  chat: string,
  content: string,
  clientMessageId = crypto.randomUUID()
) {
  const response = await request.post(`${users}/api/chats/${chat}/messages`, {
    headers: auth(session),
    data: { content, clientMessageId },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ id: string }>;
}
async function notice(request: APIRequestContext, session: Session, type: string) {
  await expect
    .poll(
      async () =>
        (await snapshot(request, session)).notifications.filter(item => item.type === type).length
    )
    .toBe(1);
  return (await snapshot(request, session)).notifications.find(item => item.type === type)!;
}

test("two ordinary users receive canonical follow, reaction, friendship and chat notices through real UI actions", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(150000);
  const createdIds: string[] = [];
  const recipientContext = await browser.newContext();
  const reactionContext = await browser.newContext();
  let reactionRecipient: Session | undefined;
  try {
    const { members, sessions } = await pair(request, createdIds);
    const recipient = await recipientContext.newPage();
    await login(page, members[0]);
    await login(recipient, members[1]);
    await recipient.goto("http://127.0.0.1:3100/notifications");
    await page.goto(`/user/${sessions[1].user.id}`);
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unfollow", exact: true })).toBeVisible();
    const follow = await notice(request, sessions[1], "Follow");
    expect(follow.sourceUserId).toBe(sessions[0].user.id);
    expect(follow.targetUserId).toBe(sessions[1].user.id);
    await expect(row(recipient, follow.id)).toHaveCount(1);
    await row(recipient, follow.id)
      .getByRole("button", { name: "Open notification", exact: true })
      .click();
    await expect(recipient).toHaveURL(new RegExp(`/user/${sessions[0].user.id}$`));
    expect((await snapshot(request, sessions[1])).unreadCount).toBe(0);

    // The Feed's first public-author page includes the seeded ordinary Alice.
    // Fresh pairs appear on later author pages; use this known discoverable
    // recipient for the reaction workflow and delete only the fresh actor.
    const alice = accounts.find(account => account.username === "alice")!;
    reactionRecipient = await apiLogin(request, alice);
    expect(reactionRecipient.user.roles).toEqual(["User"]);
    const reactionPage = await reactionContext.newPage();
    await login(reactionPage, alice);
    await reactionPage.goto("http://127.0.0.1:3100/music");
    await reactionPage.getByRole("heading", { name: "Morning Loop", exact: true }).click();
    await expect
      .poll(async () => {
        const response = await request.post(`${users}/api/feed/nowplaying/batch`, {
          headers: auth(reactionRecipient!),
          data: { userIds: [reactionRecipient!.user.id] },
        });
        expect(response.status()).toBe(200);
        return ((await response.json()) as { songId: string }[]).some(
          item => item.songId === fixtures.songIds[0]
        );
      })
      .toBe(true);
    // SPA navigation preserves the ordinary user's real player state.
    await reactionPage.getByRole("button", { name: "Notifications", exact: true }).click();
    await reactionPage.getByRole("link", { name: "View all notifications", exact: true }).click();
    await expect(reactionPage).toHaveURL(/\/notifications$/);
    const priorReactionCount = (await snapshot(request, reactionRecipient)).unreadCount;
    await recipient.goto("http://127.0.0.1:3100/notifications");
    await page.goto("/feed");
    const livePost = page.locator("section").filter({
      hasText: "Now Playing",
      has: page.locator(`a[href="/user/${reactionRecipient.user.id}"]`),
    });
    await expect(livePost).toHaveCount(1);
    // Reactions belong to the visible card; the existing feed shuffle can place it later.
    await livePost.scrollIntoViewIfNeeded();
    await expect(
      livePost.getByRole("button", { name: "Add ❤️ reaction", exact: true })
    ).toBeEnabled();
    await livePost.getByRole("button", { name: "Add ❤️ reaction", exact: true }).click();
    await expect(
      livePost.getByRole("button", { name: "Remove ❤️ reaction", exact: true })
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await snapshot(request, reactionRecipient!)).notifications.filter(
            item => item.type === "Reaction" && item.sourceUserId === sessions[0].user.id
          ).length
      )
      .toBe(1);
    const reaction = (await snapshot(request, reactionRecipient)).notifications.find(
      item => item.type === "Reaction" && item.sourceUserId === sessions[0].user.id
    )!;
    expect(reaction.data.postId).toMatch(/^[a-f0-9]{24}$/);
    await expect(row(reactionPage, reaction.id)).toHaveCount(1);
    expect((await snapshot(request, reactionRecipient)).unreadCount).toBe(priorReactionCount + 1);
    await row(reactionPage, reaction.id)
      .getByRole("button", { name: "Open notification", exact: true })
      .click();
    await expect(reactionPage).toHaveURL(new RegExp(`/feed/post/${reaction.data.postId}$`));
    await expect(reactionPage.getByText("Failed to load post", { exact: true })).toHaveCount(0);
    await expect(reactionPage.getByRole("main")).toContainText("Morning Loop");
    expect((await snapshot(request, reactionRecipient)).unreadCount).toBe(priorReactionCount);
    const liveId = `nowplaying:${reactionRecipient.user.id}:${fixtures.songIds[0]}`;
    await page.goto(`http://127.0.0.1:3100/feed/post/${encodeURIComponent(liveId)}`);
    await expect(page.getByRole("main")).toContainText("Morning Loop");

    await page.goto("/friends");
    await recipient.goto("http://127.0.0.1:3100/notifications");
    await page
      .getByRole("textbox", { name: "Search users...", exact: true })
      .fill(members[1].username);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const pending = await notice(request, sessions[1], "FriendRequest");
    await expect(row(recipient, pending.id)).toHaveCount(1);
    await row(recipient, pending.id)
      .getByRole("button", { name: "Mark as read", exact: true })
      .click();
    await row(recipient, pending.id).getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    const accepted = await notice(request, sessions[0], "FriendRequestAccepted");
    await page.goto("/notifications");
    await expect(row(page, accepted.id)).toHaveCount(1);
    expect(
      (await snapshot(request, sessions[1])).notifications.find(item => item.id === pending.id)
        ?.status
    ).toBe("Handled");

    const chat = await createChat(request, sessions);
    await page.goto(`/chat/${chat}`);
    const content = `Notification UI delivery ${crypto.randomUUID()}`;
    await page.getByPlaceholder("Type a message...").fill(content);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    const message = await notice(request, sessions[1], "Message");
    expect(message.data.chatId).toBe(chat);
    await expect(row(recipient, message.id)).toHaveCount(1);
    await row(recipient, message.id)
      .getByRole("button", { name: "Open notification", exact: true })
      .click();
    await expect(recipient).toHaveURL(new RegExp(`/chat/${chat}$`));
    await expect(recipient.getByText(content, { exact: true })).toHaveCount(1);
    await expect.poll(async () => (await snapshot(request, sessions[1])).unreadCount).toBe(0);
    const countBefore = (await snapshot(request, sessions[1])).totalCount;
    const active = `Visible active chat ${crypto.randomUUID()}`;
    await page.getByPlaceholder("Type a message...").fill(active);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(recipient.getByText(active, { exact: true })).toHaveCount(1);
    expect((await snapshot(request, sessions[1])).totalCount).toBe(countBefore);
    expect(
      (
        await request.post(`${users}/api/users/${sessions[1].user.id}/listening-history`, {
          headers: auth(sessions[1]),
          data: { songId: fixtures.songIds[0], duration: 1 },
        })
      ).status()
    ).toBe(200);
    const week = new Date();
    week.setUTCDate(week.getUTCDate() - week.getUTCDay());
    const weekKey = week.toISOString().slice(0, 10).replaceAll("-", "");
    const virtualId = `weekly:artists:${sessions[1].user.id}:${weekKey}`;
    expect(
      (
        await request.get(`${users}/api/feed/post?id=${encodeURIComponent(virtualId)}`, {
          headers: auth(sessions[1]),
        })
      ).status()
    ).toBe(200);
    const detail = recipient.waitForResponse(response =>
      response.url().startsWith(`${users}/api/feed/post?`)
    );
    await recipient.goto(`http://127.0.0.1:3100/feed/post/${encodeURIComponent(virtualId)}`);
    const loaded = await detail;
    expect(
      new URL(loaded.url()).searchParams.get("id"),
      "Virtual notification destinations must decode once before the API query"
    ).toBe(virtualId);
    expect(loaded.status()).toBe(200);
    await expect(recipient.getByText("Failed to load post", { exact: true })).toHaveCount(0);
  } finally {
    try {
      if (reactionRecipient) {
        const teardown = await apiRequests.newContext();
        try {
          const clear = await teardown.delete(
            `${users}/api/feed/nowplaying/${reactionRecipient.user.id}`,
            {
              headers: auth(reactionRecipient),
            }
          );
          expect(clear.status()).toBe(200);
        } finally {
          await teardown.dispose();
        }
      }
    } finally {
      try {
        await recipientContext.close();
      } finally {
        try {
          await reactionContext.close();
        } finally {
          await cleanup(createdIds);
        }
      }
    }
  }
});

test("read and dismiss synchronize tabs, failed commands stay actionable and bulk reads preserve later arrivals", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const createdIds: string[] = [];
  const second = await page.context().newPage();
  let releaseBulk = () => {};
  try {
    const { members, sessions } = await pair(request, createdIds);
    const chat = await createChat(request, sessions);
    await send(request, sessions[0], chat, "First notification");
    await send(request, sessions[0], chat, "Second notification");
    await login(page, members[1]);
    await page.goto("/notifications");
    await second.goto("http://127.0.0.1:3100/notifications");
    const initial = await snapshot(request, sessions[1]);
    expect(initial.unreadCount).toBe(2);
    const first = initial.notifications.find(item => item.message === "First notification")!;
    const next = initial.notifications.find(item => item.message === "Second notification")!;
    await row(page, first.id).getByRole("button", { name: "Mark as read", exact: true }).click();
    await expect(row(second, first.id).getByText("Read", { exact: true })).toBeVisible();
    await row(page, first.id)
      .getByRole("button", { name: "Delete notification", exact: true })
      .click();
    await expect(row(second, first.id)).toHaveCount(0);
    expect((await snapshot(request, sessions[1])).unreadCount).toBe(1);
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true })
    ).toHaveAccessibleDescription(/1 unread/);
    await page.getByRole("button", { name: "Notifications", exact: true }).press("Escape");

    await page.route(`**/api/notifications/${next.id}/read`, route =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Controlled read failure" }),
      })
    );
    await row(page, next.id)
      .getByRole("button", { name: "Open notification", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Controlled read failure" })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/notifications$/);
    expect((await snapshot(request, sessions[1])).unreadCount).toBe(1);
    await page.unroute(`**/api/notifications/${next.id}/read`);
    await page.route(`**/api/notifications/${next.id}*`, async route => {
      if (route.request().method() === "DELETE")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Controlled dismiss failure" }),
        });
      else await route.continue();
    });
    await row(page, next.id)
      .getByRole("button", { name: "Delete notification", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Controlled dismiss failure" })
    ).toBeVisible();
    await expect(row(page, next.id)).toHaveCount(1);
    await page.unroute(`**/api/notifications/${next.id}*`);

    const gate = new Promise<void>(resolve => {
      releaseBulk = resolve;
    });
    let captured!: () => void;
    const started = new Promise<void>(resolve => {
      captured = resolve;
    });
    await page.route(`**/api/notifications/${sessions[1].user.id}/read-all`, async route => {
      expect(route.request().postDataJSON()).toEqual({ throughId: next.id });
      captured();
      await gate;
      await route.continue();
    });
    await page.getByRole("button", { name: "Mark all read", exact: true }).click();
    await started;
    await send(request, sessions[0], chat, "Arrived after bulk boundary");
    const later = (await snapshot(request, sessions[1])).notifications.find(
      item => item.message === "Arrived after bulk boundary"
    )!;
    await expect(row(second, later.id)).toHaveCount(1);
    releaseBulk();
    await expect.poll(async () => (await snapshot(request, sessions[1])).unreadCount).toBe(1);
    await expect(row(page, next.id).getByText("Read", { exact: true })).toBeVisible();
    await expect(row(second, next.id).getByText("Read", { exact: true })).toBeVisible();
    await row(page, later.id)
      .getByRole("button", { name: "Delete notification", exact: true })
      .click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(row(second, later.id)).toHaveCount(0);
    expect((await snapshot(request, sessions[1])).unreadCount).toBe(0);
    await page.reload();
    await expect(row(page, next.id).getByText("Read", { exact: true })).toBeVisible();
  } finally {
    releaseBulk();
    try {
      await second.close();
    } finally {
      await cleanup(createdIds);
    }
  }
});

test("notifications reject delayed snapshots, page stable history and recover missed realtime events", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const createdIds: string[] = [];
  let releaseSnapshot = () => {};
  try {
    const { members, sessions } = await pair(request, createdIds);
    const chat = await createChat(request, sessions);
    for (let index = 0; index < 55; index++)
      await send(request, sessions[0], chat, `Timeline ${String(index).padStart(2, "0")}`);
    await login(page, members[1]);
    const gate = new Promise<void>(resolve => {
      releaseSnapshot = resolve;
    });
    let captured!: () => void;
    const started = new Promise<void>(resolve => {
      captured = resolve;
    });
    let held = false;
    await page.route(`**/api/notifications/${sessions[1].user.id}?*`, async route => {
      if (route.request().method() !== "GET" || held) {
        await route.continue();
        return;
      }
      held = true;
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    });
    await page.goto("/notifications");
    await started;
    await send(request, sessions[0], chat, "Live while older snapshot is held");
    const live = (await snapshot(request, sessions[1])).notifications.find(
      item => item.message === "Live while older snapshot is held"
    )!;
    releaseSnapshot();
    await expect(row(page, live.id)).toHaveCount(1);
    await page.getByRole("button", { name: "Load older notifications", exact: true }).click();
    await expect(page.locator("article[data-notification-id]")).toHaveCount(56);
    const state = await snapshot(request, sessions[1], "?limit=100");
    expect(
      await page
        .locator("article[data-notification-id]")
        .evaluateAll(elements =>
          elements.map(element => element.getAttribute("data-notification-id"))
        )
    ).toEqual(state.notifications.map(item => item.id));
    await page.context().setOffline(true);
    await expect(page.getByText(/reconnect|offline|connection interrupted/i).first()).toBeVisible({
      timeout: 45000,
    });
    for (let index = 0; index < 60; index++)
      await send(request, sessions[0], chat, `Missed ${String(index).padStart(2, "0")}`);
    await page.context().setOffline(false);
    const latest = (await snapshot(request, sessions[1])).notifications[0];
    await expect(row(page, latest.id)).toHaveCount(1, { timeout: 45000 });
    await expect(page.locator("article[data-notification-id]")).toHaveCount(100);
    await page.getByRole("button", { name: "Load older notifications", exact: true }).click();
    await expect(page.locator("article[data-notification-id]")).toHaveCount(116);
    const ids = await page
      .locator("article[data-notification-id]")
      .evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-notification-id"))
      );
    expect(new Set(ids).size).toBe(116);
    expect((await snapshot(request, sessions[1])).unreadCount).toBe(116);
  } finally {
    releaseSnapshot();
    try {
      await page.context().setOffline(false);
    } finally {
      await cleanup(createdIds);
    }
  }
});

test("logout rejects delayed owner data and mobile notification actions work by keyboard without overflow", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const createdIds: string[] = [];
  let releaseOwner = () => {};
  try {
    const { members, sessions } = await pair(request, createdIds);
    const chat = await createChat(request, sessions);
    await send(request, sessions[1], chat, "Private notification for previous account");
    const old = (await snapshot(request, sessions[0])).notifications[0];
    const gate = new Promise<void>(resolve => {
      releaseOwner = resolve;
    });
    let captured!: () => void;
    const started = new Promise<void>(resolve => {
      captured = resolve;
    });
    let held = false;
    await page.route(`**/api/notifications/${sessions[0].user.id}?*`, async route => {
      if (held || route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      held = true;
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    });
    await login(page, members[0]);
    await started;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/3100\/$/);
    await login(page, members[1]);
    await page.goto("/notifications");
    await send(request, sessions[0], chat, "Visible only to the second account");
    const current = (await snapshot(request, sessions[1])).notifications[0];
    await expect(row(page, current.id)).toHaveCount(1);
    releaseOwner();
    await expect(row(page, old.id)).toHaveCount(0);
    await expect(
      page.getByText("Private notification for previous account", { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Notifications", exact: true })
    ).toHaveAccessibleDescription(/1 unread/);
    await page.setViewportSize({ width: 390, height: 844 });
    const close = page.getByRole("button", { name: "Close sidebar", exact: true });
    if (await close.isVisible()) await close.click();
    await row(page, current.id)
      .getByRole("button", { name: "Mark as read", exact: true })
      .press("Enter");
    await expect(row(page, current.id).getByText("Read", { exact: true })).toBeVisible();
    expect((await snapshot(request, sessions[1])).unreadCount).toBe(0);
    await send(request, sessions[0], chat, `Long notification preview ${"word ".repeat(190)}`);
    const long = (await snapshot(request, sessions[1])).notifications[0];
    await expect(row(page, long.id)).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await row(page, long.id)
      .getByRole("button", { name: "Delete notification", exact: true })
      .press("Enter");
    await expect(row(page, long.id)).toHaveCount(0);
    await expect(page).toHaveURL(/\/notifications$/);
    await page.reload();
    await expect(row(page, current.id).getByText("Read", { exact: true })).toBeVisible();
  } finally {
    releaseOwner();
    await cleanup(createdIds);
  }
});

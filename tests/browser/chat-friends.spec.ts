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
const accounts = JSON.parse(
  readFileSync("demo/accounts.local.json", "utf8").replace(/^\uFEFF/, "")
) as Account[];
const identity = "http://127.0.0.1:5101";
const users = "http://127.0.0.1:5103";
const headers = (session: Session) => ({
  Authorization: `Bearer ${session.token}`,
  "X-Spotibuds-Request": "1",
});

async function apiLogin(request: APIRequestContext, account: Account): Promise<Session> {
  const response = await request.post(`${identity}/api/auth/login`, {
    headers: { "X-Spotibuds-Request": "1" },
    data: { username: account.username, password: account.password },
  });
  expect(response.status(), "Fixture sign-in must succeed").toBe(200);
  return response.json() as Promise<Session>;
}

async function login(page: Page, account: Account) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function pair(request: APIRequestContext) {
  const suffix = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
  const members = [0, 1].map(index => ({
    username: `chatfriend${suffix}${index}`,
    email: `chatfriend${suffix}${index}@example.test`,
    password: `Fixture!Aa8${crypto.randomUUID()}`,
  }));
  const sessions: Session[] = [];
  for (const member of members) {
    const created = await request.post(`${identity}/api/auth/register`, {
      headers: { "X-Spotibuds-Request": "1" },
      data: { ...member, isPrivate: false },
    });
    expect(created.status(), "Only fresh ordinary fixtures are provisioned").toBe(200);
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

async function cleanup(request: APIRequestContext, sessions: Session[], chatId?: string) {
  if (chatId) {
    expect(
      (
        await request.delete(`${users}/api/chats/${chatId}`, { headers: headers(sessions[0]) })
      ).status()
    ).toBe(200);
    expect(
      (
        await request.get(`${users}/api/chats/${chatId}`, { headers: headers(sessions[0]) })
      ).status()
    ).toBe(404);
  }
  const admin = await apiLogin(
    request,
    accounts.find(account => account.username === "demoadmin")!
  );
  for (const session of sessions) {
    expect(
      (
        await request.delete(`${identity}/api/auth/users/${session.user.id}`, {
          headers: headers(admin),
        })
      ).status()
    ).toBe(204);
    expect(
      (
        await request.get(`${identity}/api/auth/users/${session.user.id}`, {
          headers: headers(admin),
        })
      ).status()
    ).toBe(404);
    expect(
      (
        await request.get(`${users}/api/users/${session.user.id}`, { headers: headers(admin) })
      ).status()
    ).toBe(404);
  }
  expect(
    (await request.post(`${identity}/api/auth/logout`, { headers: headers(admin) })).status()
  ).toBe(204);
}

async function search(page: Page, username: string) {
  await page.getByRole("textbox", { name: "Search users...", exact: true }).fill(username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
}

test("friend requests update both users live through cancel, decline, acceptance and removal", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120000);
  const { members, sessions } = await pair(request);
  const other = await browser.newContext();
  const recipient = await other.newPage();
  try {
    await login(page, members[0]);
    await login(recipient, members[1]);
    await page.goto("/friends");
    await recipient.goto("http://127.0.0.1:3100/friends");
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(recipient.getByText("Connected", { exact: true })).toBeVisible();
    const cancel = page.getByRole("button", {
      name: `Cancel friend request to ${members[1].username}`,
      exact: true,
    });
    const accept = recipient.getByRole("button", {
      name: `Accept friend request from ${members[0].username}`,
      exact: true,
    });
    const decline = recipient.getByRole("button", {
      name: `Decline friend request from ${members[0].username}`,
      exact: true,
    });
    const relationship = async () => {
      const response = await request.get(
        `${users}/api/friends/status?userId1=${sessions[0].user.id}&userId2=${sessions[1].user.id}`,
        { headers: headers(sessions[0]) }
      );
      expect(response.status()).toBe(200);
      return response.json() as Promise<{ status: string; friendshipId?: string }>;
    };
    await search(page, members[1].username);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(cancel).toHaveCount(1);
    await expect(accept).toHaveCount(1);
    const first = await relationship();
    expect(first.status).toBe("pending");
    expect(
      (
        await request.post(`${users}/api/friends/request`, {
          headers: headers(sessions[0]),
          data: { targetUserId: sessions[1].user.id },
        })
      ).status()
    ).toBe(409);
    expect(
      (
        await request.post(`${users}/api/friends/request`, {
          headers: headers(sessions[0]),
          data: { targetUserId: sessions[0].user.id },
        })
      ).status()
    ).toBe(400);
    await cancel.click();
    await expect(cancel).toHaveCount(0);
    await expect(accept).toHaveCount(0);
    expect((await relationship()).status.toLowerCase()).toBe("none");

    await search(page, members[1].username);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(decline).toHaveCount(1);
    const second = await relationship();
    expect(second.friendshipId).not.toBe(first.friendshipId);
    expect(
      (
        await request.post(`${users}/api/friends/${first.friendshipId}/accept`, {
          headers: headers(sessions[1]),
        })
      ).status()
    ).toBe(404);
    await decline.click();
    await expect(cancel).toHaveCount(0);
    await expect(accept).toHaveCount(0);
    expect((await relationship()).status).toBe("declined");

    await search(page, members[1].username);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(accept).toHaveCount(1);
    await accept.click();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(1);
    await expect(recipient.getByRole("button", { name: "Remove", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Friends", exact: true })).toBeDisabled();
    await expect(cancel).toHaveCount(0);
    expect((await relationship()).status).toBe("accepted");
    for (let index = 0; index < sessions.length; index++) {
      const response = await request.get(`${users}/api/friends/${sessions[index].user.id}`, {
        headers: headers(sessions[index]),
      });
      expect(await response.json()).toEqual([sessions[1 - index].user.id]);
    }
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    await expect(recipient.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    expect((await relationship()).status.toLowerCase()).toBe("none");
  } finally {
    await other.close();
    await cleanup(request, sessions);
  }
});

test("chat merges delayed history, pages older messages and recovers a long reconnect gap", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180000);
  const { members, sessions } = await pair(request);
  const other = await browser.newContext();
  const recipient = await other.newPage();
  let chatId = "";
  let releaseHistory = () => {};
  try {
    const created = await request.post(`${users}/api/chats/create-or-get`, {
      headers: headers(sessions[0]),
      data: { participantIds: sessions.map(session => session.user.id) },
    });
    expect(created.status()).toBe(200);
    chatId = ((await created.json()) as { chatId: string }).chatId;
    for (let index = 0; index < 55; index++) {
      const response = await request.post(`${users}/api/chats/${chatId}/messages`, {
        headers: headers(sessions[0]),
        data: {
          content: `History fixture ${String(index).padStart(2, "0")}`,
          clientMessageId: crypto.randomUUID(),
        },
      });
      expect(response.status()).toBe(200);
    }
    await login(page, members[0]);
    await login(recipient, members[1]);
    const release = new Promise<void>(resolve => {
      releaseHistory = resolve;
    });
    let intercepted!: () => void;
    const firstHistory = new Promise<void>(resolve => {
      intercepted = resolve;
    });
    let held = false;
    const live = "Live arrival while initial history is held";
    let joined!: () => void;
    const chatJoined = new Promise<void>(resolve => {
      joined = resolve;
    });
    let arrived!: () => void;
    const liveArrived = new Promise<void>(resolve => {
      arrived = resolve;
    });
    let ownRead!: () => void;
    const ownReadSaved = new Promise<void>(resolve => {
      ownRead = resolve;
    });
    const observeFrames = (payload: string) => {
      for (const frame of payload.split("\u001e")) {
        if (!frame) continue;
        try {
          const event = JSON.parse(frame) as {
            target?: string;
            arguments?: [{ content?: string; chatId?: string; userId?: string } | string];
          };
          if (event.target === "ChatJoined" && event.arguments?.[0] === chatId) joined();
          const message = event.arguments?.[0];
          if (
            event.target === "AllMessagesRead" &&
            typeof message === "object" &&
            message?.chatId === chatId &&
            message.userId === sessions[0].user.id
          )
            ownRead();
          if (
            event.target === "ReceiveMessage" &&
            typeof message === "object" &&
            message?.content === live &&
            message.chatId === chatId
          )
            arrived();
        } catch {
          /* Protocol handshakes and unrelated frames do not satisfy the assertions. */
        }
      }
    };
    page.on("websocket", socket =>
      socket.on("framereceived", event => {
        if (typeof event.payload === "string") observeFrames(event.payload);
      })
    );
    page.on("response", response => {
      if (
        response.url().includes("/chat-hub") &&
        response.request().method() === "GET" &&
        response.status() === 200
      )
        void response
          .text()
          .then(observeFrames)
          .catch(() => undefined);
    });
    await page.route(`**/api/chats/${chatId}/messages*`, async route => {
      if (route.request().method() !== "GET" || held) {
        await route.continue();
        return;
      }
      held = true;
      const response = await route.fetch();
      intercepted();
      await release;
      await route.fulfill({ response });
    });
    await page.goto(`/chat/${chatId}`);
    await firstHistory;
    await chatJoined;
    expect(
      (
        await request.post(`${users}/api/chats/${chatId}/messages`, {
          headers: headers(sessions[1]),
          data: { content: live, clientMessageId: crypto.randomUUID() },
        })
      ).status()
    ).toBe(200);
    await liveArrived;
    releaseHistory();
    await expect(page.getByText("History fixture 54", { exact: true })).toHaveCount(1);
    await expect(page.getByText(live, { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Load older messages", exact: true }).click();
    await expect(page.getByText("History fixture 00", { exact: true })).toHaveCount(1);
    const expected = Array.from(
      { length: 55 },
      (_, index) => `History fixture ${String(index).padStart(2, "0")}`
    );
    const actual = await page.getByText(/^History fixture \d{2}$/).allTextContents();
    expect(actual).toEqual(expected);
    await expect(page.getByText(live, { exact: true })).toHaveCount(1);
    await ownReadSaved;
    const stored = await request.get(`${users}/api/chats/${chatId}/messages`, {
      headers: headers(sessions[0]),
    });
    expect(stored.status()).toBe(200);
    const persisted = (await stored.json()) as { content: string; readBy: { userId: string }[] }[];
    expect(
      persisted
        .find(saved => saved.content === live)
        ?.readBy.some(receipt => receipt.userId === sessions[0].user.id)
    ).toBe(true);
    await expect(
      page
        .getByText("History fixture 54", { exact: true })
        .locator("..")
        .getByLabel("Sent", { exact: true })
    ).toHaveCount(1);
    await recipient.goto(`http://127.0.0.1:3100/chat/${chatId}`);
    await expect(recipient.getByText("History fixture 54", { exact: true })).toHaveCount(1);
    await expect(page.getByText("History fixture 54", { exact: true }).locator("..")).toContainText(
      "✓✓",
      { timeout: 20000 }
    );
    await page.reload();
    await expect(page.getByText("History fixture 54", { exact: true }).locator("..")).toContainText(
      "✓✓"
    );
    const draft = page.getByPlaceholder("Type a message...");
    await draft.fill("Retained during a long disconnect");
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
    await page.context().setOffline(true);
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled({
      timeout: 45000,
    });
    const missed = Array.from(
      { length: 80 },
      (_, index) => `Disconnected fixture ${String(index).padStart(2, "0")}`
    );
    for (const content of missed) {
      expect(
        (
          await request.post(`${users}/api/chats/${chatId}/messages`, {
            headers: headers(sessions[1]),
            data: { content, clientMessageId: crypto.randomUUID() },
          })
        ).status()
      ).toBe(200);
    }
    await page.context().setOffline(false);
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled({
      timeout: 45000,
    });
    await expect(page.getByText(/^Disconnected fixture \d{2}$/)).toHaveCount(80);
    expect(await page.getByText(/^Disconnected fixture \d{2}$/).allTextContents()).toEqual(missed);
    await expect(draft).toHaveValue("Retained during a long disconnect");
  } finally {
    releaseHistory();
    await page.context().setOffline(false);
    await other.close();
    await cleanup(request, sessions, chatId || undefined);
  }
});

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
function token(seconds = 3600) {
  return `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`;
}
const user = { id: "alice-id", username: "alice", roles: ["User"] };
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("session and authenticated requests", () => {
  it("keeps tokens in memory and clears every legacy credential and profile on refresh failure", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    localStorage.setItem("user", "stale");
    localStorage.setItem("refreshToken", "stale");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "revoked" }, 401)));
    expect(await session.refreshSession()).toBeNull();
    for (const key of [
      "token",
      "refreshToken",
      "currentUser",
      "user",
      "spotibuds:refresh-operation",
    ])
      expect(localStorage.getItem(key)).toBeNull();
    expect(session.getAccessToken()).toBeNull();
  });
  it("coalesces concurrent expiry and sends protected-cookie headers without persistent credentials", async () => {
    const session = await import("../src/lib/session");
    const { apiRequest } = await import("../src/lib/request");
    session.commitSession({ token: token(-1), user });
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes("/refresh/")) {
        await Promise.resolve();
        expect(options.credentials).toBe("include");
        expect(new Headers(options.headers).get("X-Spotibuds-Request")).toBe("1");
        expect(new Headers(options.headers).get("X-Spotibuds-Refresh-Request")).toMatch(
          /^[0-9a-f-]{36}$/
        );
        expect(options.body).toBeUndefined();
        if (url.endsWith("/prepare")) return new Response(null, { status: 204 });
        return json({ token: token(), user });
      }
      expect(new Headers(options.headers).get("Authorization")).toMatch(/^Bearer /);
      return json({ saved: true });
    });
    vi.stubGlobal("fetch", fetch);
    const values = await Promise.all([
      apiRequest("http://127.0.0.1:5102/api/a"),
      apiRequest("http://127.0.0.1:5102/api/b"),
      apiRequest("http://127.0.0.1:5102/api/c"),
    ]);
    expect(values).toEqual([{ saved: true }, { saved: true }, { saved: true }]);
    const phases = fetch.mock.calls.filter(([url]) => url.includes("/refresh/"));
    expect(phases.map(([url]) => url.split("/").at(-1))).toEqual(["prepare", "complete"]);
    expect(new Headers(phases[0][1].headers).get("X-Spotibuds-Refresh-Request")).toBe(
      new Headers(phases[1][1].headers).get("X-Spotibuds-Refresh-Request")
    );
    expect(localStorage.getItem("spotibuds:refresh-operation")).toBeNull();
  });
  it("cannot restore credentials when logout happens during delayed renewal", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    let resolve!: (value: Response) => void;
    const delayed = new Promise<Response>(done => {
      resolve = done;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/complete") ? delayed : Promise.resolve(new Response(null, { status: 204 }))
      )
    );
    const pending = session.refreshSession();
    await vi.waitFor(() =>
      expect(localStorage.getItem("spotibuds:refresh-operation")).not.toBeNull()
    );
    await session.logoutSession();
    resolve(json({ token: token(), user }));
    expect(await pending).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
    expect(localStorage.getItem("spotibuds:refresh-operation")).toBeNull();
  });
  it("retries a 401 only once and clears the session after a second 401", async () => {
    const session = await import("../src/lib/session");
    const { apiRequest } = await import("../src/lib/request");
    session.commitSession({ token: token(), user });
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/prepare")) return new Response(null, { status: 204 });
      return url.endsWith("/complete")
        ? json({ token: token(), user })
        : json({ message: "denied" }, 401);
    });
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest("http://127.0.0.1:5102/api/a")).rejects.toThrow("denied");
    expect(fetch.mock.calls).toHaveLength(4);
    expect(session.getSessionUser()).toBeNull();
  });
  it("authenticates playlist JSON and multipart writes and handles empty 204 responses", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    const { PlaylistService } = await import("../src/lib/playlist");
    const { musicApi } = await import("../src/lib/api");
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      const headers = new Headers(options.headers);
      expect(headers.get("Authorization")).toMatch(/^Bearer /);
      if (options.body instanceof FormData) {
        expect(headers.has("Content-Type")).toBe(false);
        return json({ coverUrl: "/new-cover" });
      }
      if (options.body) expect(headers.get("Content-Type")).toBe("application/json");
      if (url.includes("/user/")) return json({ id: "playlist-id", songs: [] });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetch);
    await PlaylistService.createPlaylist(user.id, { name: "Collection" });
    await PlaylistService.updatePlaylist("playlist-id", { description: "" });
    await PlaylistService.addSongToPlaylist("playlist-id", "song-id");
    await PlaylistService.removeSongFromPlaylist("playlist-id", "song-id");
    await PlaylistService.reorderSongs("playlist-id", []);
    await musicApi.uploadPlaylistCover(
      "playlist-id",
      new File(["image"], "cover.png", { type: "image/png" })
    );
    await musicApi.deletePlaylistCover("playlist-id");
    await PlaylistService.deletePlaylist("playlist-id");
    expect(fetch).toHaveBeenCalledTimes(8);
  });
  it("propagates service outages instead of returning empty catalogue data", async () => {
    const { musicApi, notificationsApi } = await import("../src/lib/api");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() => Promise.resolve(json({ message: "Database unavailable" }, 503)))
    );
    await expect(musicApi.getSongs()).rejects.toThrow("Database unavailable");
    await expect(notificationsApi.getNotifications("id")).rejects.toThrow("Database unavailable");
  });
  it("does not attach session credentials to arbitrary destinations", async () => {
    const { apiRequest } = await import("../src/lib/request");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest("https://untrusted.invalid/steal")).rejects.toThrow("configured API");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resumes only the pending operation after a lost completion and module reload", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(-1), user });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/prepare")) return new Response(null, { status: 204 });
        throw new TypeError("Interrupted completion response");
      })
    );
    expect(await session.refreshSession()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    const operation = JSON.parse(localStorage.getItem("spotibuds:refresh-operation")!);
    expect(Object.keys(operation).sort()).toEqual(["id", "startedAt"]);
    vi.resetModules();
    const reloaded = await import("../src/lib/session");
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      expect(new Headers(options.headers).get("X-Spotibuds-Refresh-Request")).toBe(operation.id);
      return url.endsWith("/prepare")
        ? new Response(null, { status: 204 })
        : json({ token: token(), user });
    });
    vi.stubGlobal("fetch", fetch);
    expect(await reloaded.refreshSession()).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reloaded.getSessionUser()?.id).toBe(user.id);
    expect(localStorage.getItem("spotibuds:refresh-operation")).toBeNull();
  });

  it("does not reuse an expired operation marker", async () => {
    const expired = { id: crypto.randomUUID(), startedAt: Date.now() - 31000 };
    localStorage.setItem("spotibuds:refresh-operation", JSON.stringify(expired));
    const session = await import("../src/lib/session");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        expect(new Headers(options.headers).get("X-Spotibuds-Refresh-Request")).not.toBe(
          expired.id
        );
        return url.endsWith("/prepare")
          ? new Response(null, { status: 204 })
          : json({ token: token(), user });
      })
    );
    expect(await session.refreshSession()).toBeTruthy();
    expect(localStorage.getItem("spotibuds:refresh-operation")).toBeNull();
  });

  it("cannot replace a new account after an old staged completion arrives", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(-1), user });
    let resolve!: (value: Response) => void;
    const delayed = new Promise<Response>(done => {
      resolve = done;
    });
    const fetch = vi.fn((url: string) =>
      url.endsWith("/complete") ? delayed : Promise.resolve(new Response(null, { status: 204 }))
    );
    vi.stubGlobal("fetch", fetch);
    const pending = session.refreshSession();
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.endsWith("/complete"))).toBe(true)
    );
    const nextGeneration = await session.beginLogin();
    const nextUser = { id: "bob-id", username: "bob", roles: ["User"] };
    session.commitSession({ token: token(), user: nextUser }, nextGeneration, true);
    resolve(json({ token: token(), user }));
    expect(await pending).toBeNull();
    expect(session.getSessionUser()?.id).toBe(nextUser.id);
    expect(localStorage.getItem("spotibuds:refresh-operation")).toBeNull();
  });

  it("bounds both refresh phases by one ten-second deadline", async () => {
    vi.useFakeTimers();
    try {
      const session = await import("../src/lib/session");
      session.commitSession({ token: token(-1), user });
      const fetch = vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/prepare")) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return new Response(null, { status: 204 });
        }
        return new Promise<Response>((_, reject) =>
          options.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        );
      });
      vi.stubGlobal("fetch", fetch);
      const pending = session.refreshSession();
      await vi.advanceTimersByTimeAsync(10000);
      expect(await pending).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(session.getAccessToken()).toBeNull();
      expect(session.getSessionUser()).toBeNull();
      expect(localStorage.getItem("spotibuds:refresh-operation")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps sign-out intent after a failed revoke and reload, until explicit login succeeds", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/logout")
          ? json({ message: "Identity unavailable" }, 503)
          : new Response(null, { status: 204 })
      )
    );
    await expect(session.logoutSession()).rejects.toThrow("could not be revoked");
    expect(session.getSessionUser()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(session.getSignOutState()?.revocationPending).toBe(true);
    vi.resetModules();
    const reloaded = await import("../src/lib/session");
    const { identityApi } = await import("../src/lib/api");
    const fetch = vi.fn(async () => json({ message: "Invalid credentials" }, 401));
    vi.stubGlobal("fetch", fetch);
    expect(await reloaded.ensureAccessToken()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await expect(identityApi.login({ username: "alice", password: "incorrect" })).rejects.toThrow(
      "Invalid credentials"
    );
    expect(reloaded.getSignOutState()?.revocationPending).toBe(true);
    fetch.mockImplementation(async () => json({ token: token(), user }));
    await identityApi.login({ username: "alice", password: "valid" });
    expect(reloaded.getSignOutState()).toBeNull();
    expect(localStorage.getItem("spotibuds:sign-out")).toBeNull();
    expect(reloaded.getSessionUser()?.id).toBe(user.id);
  });

  it("blocks cookie bootstrap after reload when storage is readable but rejects writes", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/logout")
        ? json({ message: "Unavailable" }, 503)
        : new Response(null, { status: 204 })
    );
    vi.stubGlobal("fetch", fetch);
    await expect(session.logoutSession()).rejects.toThrow("could not be revoked");
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/logout"))).toBe(true);
    expect(session.getAccessToken()).toBeNull();
    vi.resetModules();
    const reloaded = await import("../src/lib/session");
    fetch.mockClear();
    expect(reloaded.getSignOutState()?.storageUnavailable).toBe(true);
    expect(await reloaded.ensureAccessToken()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("always clears local ownership and attempts server revoke when every storage method throws", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    const event = vi.fn();
    window.addEventListener(session.SESSION_EVENT, event);
    try {
      for (const method of ["getItem", "setItem", "removeItem"] as const)
        vi.spyOn(Storage.prototype, method).mockImplementation(() => {
          throw new DOMException("Blocked", "SecurityError");
        });
      const fetch = vi.fn(async (url: string) => {
        expect(new URL(url).hostname).toBe("127.0.0.1");
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", fetch);
      await session.logoutSession();
      expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/logout"))).toBe(true);
      expect(session.getAccessToken()).toBeNull();
      expect(session.getSessionUser()).toBeNull();
      expect(event).toHaveBeenCalled();
      expect(await session.ensureAccessToken()).toBeNull();
    } finally {
      window.removeEventListener(session.SESSION_EVENT, event);
    }
  });

  it("consults another tab's sign-out marker before reusing an explicit login token", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user }, session.getSessionGeneration(), true);
    localStorage.setItem(
      "spotibuds:sign-out",
      JSON.stringify({ id: crypto.randomUUID(), revocationPending: true })
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await session.ensureAccessToken()).toBeNull();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "spotibuds:sign-out",
        newValue: localStorage.getItem("spotibuds:sign-out"),
      })
    );
    expect(session.getAccessToken()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serializes a delayed logout and a different tab's explicit login under one cookie lock", async () => {
    let tail = Promise.resolve();
    const lockNames: string[] = [];
    vi.stubGlobal("navigator", {
      locks: {
        request: (name: string, _options: unknown, action: () => Promise<unknown>) => {
          lockNames.push(name);
          const result = tail.then(action);
          tail = result.then(
            () => undefined,
            () => undefined
          );
          return result;
        },
      },
    });
    const oldTab = await import("../src/lib/session");
    oldTab.commitSession({ token: token(), user });
    let resolve!: (response: Response) => void;
    const delayed = new Promise<Response>(done => {
      resolve = done;
    });
    const nextUser = { id: "bob-id", username: "bob", roles: ["User"] };
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/logout")
        ? delayed
        : url.endsWith("/login")
          ? json({ token: token(), user: nextUser })
          : new Response(null, { status: 204 })
    );
    vi.stubGlobal("fetch", fetch);
    const logout = oldTab.logoutSession();
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.endsWith("/logout"))).toBe(true)
    );
    vi.resetModules();
    const newTab = await import("../src/lib/session");
    const { identityApi } = await import("../src/lib/api");
    const login = identityApi.login({ username: "bob", password: "valid" });
    await Promise.resolve();
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/login"))).toBe(false);
    resolve(new Response(null, { status: 204 }));
    await logout;
    await login;
    expect(lockNames).toEqual(["spotibuds-refresh", "spotibuds-refresh"]);
    expect(newTab.getSessionUser()?.id).toBe(nextUser.id);
    expect(newTab.getSignOutState()).toBeNull();
    expect(localStorage.getItem("spotibuds:sign-out")).toBeNull();
  });

  it("allows explicit login after an in-flight anonymous bootstrap expires", async () => {
    let tail = Promise.resolve();
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, _options: unknown, action: () => Promise<unknown>) => {
          const result = tail.then(action);
          tail = result.then(
            () => undefined,
            () => undefined
          );
          return result;
        },
      },
    });
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(done => (resolve = done)))
    );
    const session = await import("../src/lib/session");
    const bootstrap = session.refreshSession();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    const request = vi.fn(async () => ({ token: token(), user }));
    const login = session.loginSession(request);
    expect(request).not.toHaveBeenCalled();
    resolve(json({ message: "No cookie" }, 401));
    expect(await bootstrap).toBeNull();
    await expect(login).resolves.toMatchObject({ user });
    expect(session.getSessionUser()?.id).toBe(user.id);
    expect(session.getSignOutState()).toBeNull();
  });

  it("honors a later logout while explicit login waits for bootstrap", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/prepare")
          ? new Promise<Response>(done => (resolve = done))
          : Promise.resolve(new Response(null, { status: 204 }))
      )
    );
    const session = await import("../src/lib/session");
    const bootstrap = session.refreshSession();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    const request = vi.fn(async () => ({ token: token(), user }));
    const login = session.loginSession(request);
    const rejected = expect(login).rejects.toThrow("session changed");
    await session.logoutSession();
    resolve(json({ message: "No cookie" }, 401));
    await bootstrap;
    await rejected;
    expect(request).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBeNull();
  });

  it("does not start a queued login after a later local sign-out invalidates it", async () => {
    let start!: () => void;
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, _options: unknown, action: () => Promise<unknown>) =>
          new Promise((resolve, reject) => {
            start = () => {
              void action().then(resolve, reject);
            };
          }),
      },
    });
    const session = await import("../src/lib/session");
    const request = vi.fn(async () => ({ token: token(), user }));
    const login = session.loginSession(request);
    session.clearSession("logout");
    start();
    await expect(login).rejects.toThrow("session changed");
    expect(request).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBeNull();
  });

  it("persists intent after cleanup frees initially full storage", async () => {
    const session = await import("../src/lib/session");
    session.commitSession({ token: token(), user });
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "spotibuds:sign-out" && this.getItem("currentUser"))
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/logout")
          ? json({ message: "Unavailable" }, 503)
          : new Response(null, { status: 204 })
      )
    );
    await expect(session.logoutSession()).rejects.toThrow("could not be revoked");
    expect(JSON.parse(localStorage.getItem("spotibuds:sign-out")!).revocationPending).toBe(true);
    vi.resetModules();
    const reloaded = await import("../src/lib/session");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await reloaded.ensureAccessToken()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not invalidate a queued explicit login for its same-intent revocation acknowledgement", async () => {
    const session = await import("../src/lib/session");
    const id = crypto.randomUUID();
    const pending = JSON.stringify({ id, revocationPending: true });
    const acknowledged = JSON.stringify({ id, revocationPending: false });
    localStorage.setItem("spotibuds:sign-out", pending);
    expect(session.getSignOutState()?.revocationPending).toBe(true);
    const generation = session.getSessionGeneration();
    localStorage.setItem("spotibuds:sign-out", acknowledged);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "spotibuds:sign-out",
        oldValue: pending,
        newValue: acknowledged,
      })
    );
    expect(session.getSessionGeneration()).toBe(generation);
    expect(session.getSignOutState()?.revocationPending).toBe(false);
  });
});

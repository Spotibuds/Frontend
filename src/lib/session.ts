import { API_CONFIG } from "./config";
import { reactionCache } from "./reactionCache";

export interface SessionUser {
  id: string;
  username: string;
  email?: string;
  isPrivate?: boolean;
  roles?: string[];
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
}
export interface SessionResponse {
  token: string;
  user: SessionUser;
  expiresAt?: string;
}
export const SESSION_EVENT = "spotibuds:session";
const REFRESH_OPERATION_KEY = "spotibuds:refresh-operation";
const REFRESH_OPERATION_WINDOW_MS = 30000;
type RefreshOperation = { id: string; startedAt: number };
const SIGN_OUT_KEY = "spotibuds:sign-out";
export type SignOutState = {
  id?: string;
  revocationPending: boolean;
  storageUnavailable?: boolean;
};
let accessToken: string | null = null;
let sessionUser: SessionUser | null = null;
let explicitLogin = false;
let signOutIntent: SignOutState | null = null;
let refreshMarkerMemory: RefreshOperation | null = null;
let storageWriteHealthy: boolean | null = null;
let generation = 0;
let refreshPromise: Promise<string | null> | null = null;
let refreshAbort: AbortController | null = null;
let logoutPromise: Promise<void> | null = null;
const pending = new Set<AbortController>();

export function getSignOutState(): SignOutState | null {
  if (typeof window === "undefined") return signOutIntent;
  try {
    const stored = localStorage.getItem(SIGN_OUT_KEY);
    if (stored !== null) {
      try {
        const value = JSON.parse(stored);
        signOutIntent = {
          id: typeof value?.id === "string" ? value.id : undefined,
          revocationPending: value?.revocationPending !== false,
        };
      } catch {
        signOutIntent = { revocationPending: true };
      }
      return signOutIntent;
    }
    // A readable store can still reject writes (quota or policy). Check both so
    // reload cannot silently restore a cookie when sign-out could not persist.
    if (storageWriteHealthy === null) {
      localStorage.setItem("spotibuds:storage-check", "1");
      localStorage.removeItem("spotibuds:storage-check");
      storageWriteHealthy = true;
    }
    if (!storageWriteHealthy)
      return explicitLogin && !signOutIntent
        ? null
        : signOutIntent || { revocationPending: false, storageUnavailable: true };
    return explicitLogin && stored === null ? null : signOutIntent;
  } catch {
    storageWriteHealthy = false;
    // Without durable ownership state, a cookie must never silently sign in.
    return explicitLogin && !signOutIntent
      ? null
      : signOutIntent || { revocationPending: false, storageUnavailable: true };
  }
}

function setSignOutState(revocationPending: boolean, id = crypto.randomUUID()) {
  explicitLogin = false;
  signOutIntent = { id, revocationPending };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SIGN_OUT_KEY, JSON.stringify(signOutIntent));
      storageWriteHealthy = true;
    } catch {
      storageWriteHealthy = false;
      /* Memory still blocks this document; storage failure blocks reload bootstrap. */
    }
  }
  notify("sign-out-status");
  return id;
}

async function cookieOperation<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("spotibuds-refresh", { signal }, action);
  return action();
}

// Keep the login request, installed cookie, and local commit within the same
// origin-wide lock used by renewal and logout.
export async function loginSession<T extends SessionResponse>(
  request: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const requestedIntent = getSignOutState()?.id;
  // An anonymous bootstrap may expire while login waits for the same cookie
  // lock. Let that local check settle before capturing the login's ownership.
  if (refreshPromise) await refreshPromise;
  if (getSignOutState()?.id !== requestedIntent)
    throw new Error("The session changed. Please sign in again.");
  const requestedGeneration = generation;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    return await cookieOperation(controller.signal, async () => {
      if (generation !== requestedGeneration || getSignOutState()?.id !== requestedIntent)
        throw new Error("The session changed. Please sign in again.");
      const expectedGeneration = await beginLogin(false);
      const response = await request(controller.signal);
      commitSession(response, expectedGeneration, true);
      return response;
    });
  } finally {
    clearTimeout(timer);
  }
}

function refreshOperation(): RefreshOperation {
  const now = Date.now();
  if (typeof window !== "undefined") {
    try {
      const existing = JSON.parse(localStorage.getItem(REFRESH_OPERATION_KEY) || "null");
      if (
        typeof existing?.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing.id) &&
        Number.isFinite(existing.startedAt) &&
        existing.startedAt <= now &&
        now - existing.startedAt < REFRESH_OPERATION_WINDOW_MS
      )
        return (refreshMarkerMemory = { id: existing.id, startedAt: existing.startedAt });
    } catch {
      /* A corrupt display-side marker never becomes a credential. */
    }
  }
  if (refreshMarkerMemory && now - refreshMarkerMemory.startedAt < REFRESH_OPERATION_WINDOW_MS)
    return refreshMarkerMemory;
  const operation = { id: crypto.randomUUID(), startedAt: now };
  refreshMarkerMemory = operation;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(REFRESH_OPERATION_KEY, JSON.stringify(operation));
    } catch {
      storageWriteHealthy = false;
      /* Explicit in-memory ownership can finish this document's operation. */
    }
  }
  return operation;
}

function finishRefreshOperation(id: string) {
  if (refreshMarkerMemory?.id === id) refreshMarkerMemory = null;
  if (typeof window === "undefined") return;
  try {
    if (JSON.parse(localStorage.getItem(REFRESH_OPERATION_KEY) || "null")?.id === id)
      localStorage.removeItem(REFRESH_OPERATION_KEY);
  } catch {
    try {
      localStorage.removeItem(REFRESH_OPERATION_KEY);
    } catch {
      /* No credential is stored. */
    }
  }
}

class RenewalError extends Error {
  constructor(public terminal: boolean) {
    super(
      terminal
        ? "Your session expired. Please sign in again."
        : "Session renewal is unavailable. Please retry."
    );
  }
}

export function getAccessToken() {
  return accessToken;
}
export function getSessionGeneration() {
  return generation;
}
export function registerRequest(controller: AbortController) {
  pending.add(controller);
  return () => pending.delete(controller);
}
export function getSessionUser(): SessionUser | null {
  if (getSignOutState()) return null;
  if (sessionUser) return sessionUser;
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    return user?.id && user?.username ? user : null;
  } catch {
    return null;
  }
}
function notify(reason: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { reason, generation } }));
}
export function clearSession(reason = "logout", broadcast = true) {
  generation++;
  accessToken = null;
  sessionUser = null;
  explicitLogin = false;
  reactionCache.clear();
  refreshAbort?.abort();
  refreshAbort = null;
  refreshPromise = null;
  for (const controller of pending) controller.abort();
  pending.clear();
  if (typeof window !== "undefined") {
    for (const key of [
      "token",
      "refreshToken",
      "currentUser",
      "user",
      "audioState",
      "feed_seen_v1",
    ]) {
      try {
        localStorage.removeItem(key);
      } catch {
        storageWriteHealthy = false;
        /* Local ownership is already cleared in memory. */
      }
    }
    // A failed transport can resume the same bounded operation after navigation.
    // This marker contains no access or refresh credential.
    if (reason !== "renewal-unavailable") {
      refreshMarkerMemory = null;
      try {
        localStorage.removeItem(REFRESH_OPERATION_KEY);
      } catch {
        storageWriteHealthy = false;
        /* Memory is cleared. */
      }
    }
    if (broadcast) {
      try {
        localStorage.setItem(
          "spotibuds:session-change",
          JSON.stringify({ reason, nonce: crypto.randomUUID() })
        );
      } catch {
        storageWriteHealthy = false;
        /* Storage failure must not skip local teardown or server revocation. */
      }
    }
    notify(reason);
  }
}
export function commitSession(
  response: SessionResponse,
  expectedGeneration = generation,
  fromExplicitLogin = false
) {
  if (generation !== expectedGeneration)
    throw new Error("The session changed. Please sign in again.");
  if (!response.token || !response.user?.id)
    throw new Error("Authentication returned an invalid session.");
  if (!fromExplicitLogin && getSignOutState())
    throw new Error("This device is signed out. Sign in explicitly to continue.");
  if (fromExplicitLogin) {
    explicitLogin = true;
    signOutIntent = null;
  }
  accessToken = response.token;
  sessionUser = response.user;
  if (typeof window !== "undefined") {
    try {
      if (fromExplicitLogin) localStorage.removeItem(SIGN_OUT_KEY);
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.setItem("currentUser", JSON.stringify(response.user));
      storageWriteHealthy = true;
    } catch {
      storageWriteHealthy = false;
      /* Validated ownership remains in memory; automatic reload fails closed. */
    }
    notify("authenticated");
  }
}
export function tokenExpired(token: string | null) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return !payload.exp || payload.exp * 1000 <= Date.now() + 15000;
  } catch {
    return true;
  }
}
export async function refreshSession(): Promise<string | null> {
  if (logoutPromise) await logoutPromise;
  if (getSignOutState()) return null;
  if (refreshPromise) return refreshPromise;
  const expectedGeneration = generation;
  const controller = new AbortController();
  refreshAbort = controller;
  const timer = setTimeout(() => controller.abort(), 10000);
  const refresh = async () => {
    if (generation !== expectedGeneration || getSignOutState()) return null;
    const operation = refreshOperation();
    const options: RequestInit = {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Spotibuds-Request": "1",
        "X-Spotibuds-Refresh-Request": operation.id,
      },
      signal: controller.signal,
    };
    const prepared = await fetch(`${API_CONFIG.IDENTITY_API}/api/auth/refresh/prepare`, options);
    if (prepared.status !== 204) throw new RenewalError([400, 401, 403].includes(prepared.status));
    if (generation !== expectedGeneration || getSignOutState()) return null;
    // The browser has installed the pending HttpOnly cookie before this call.
    // Completion consumes its predecessor without mutating another cookie.
    const response = await fetch(`${API_CONFIG.IDENTITY_API}/api/auth/refresh/complete`, options);
    if (!response.ok) throw new RenewalError([400, 401, 403].includes(response.status));
    const data = (await response.json()) as SessionResponse;
    commitSession(data, expectedGeneration);
    finishRefreshOperation(operation.id);
    return data.token;
  };
  const promise = (async () => {
    try {
      // A cookie rotation must not race another browser tab's rotation.
      return await cookieOperation(controller.signal, refresh);
    } catch (error) {
      if (generation === expectedGeneration)
        clearSession(
          error instanceof RenewalError && error.terminal ? "expired" : "renewal-unavailable"
        );
      return null;
    } finally {
      clearTimeout(timer);
      if (refreshAbort === controller) {
        refreshAbort = null;
        refreshPromise = null;
      }
    }
  })();
  refreshPromise = promise;
  return promise;
}
export async function ensureAccessToken() {
  if (getSignOutState()) return null;
  return !tokenExpired(accessToken) ? accessToken : refreshSession();
}
export async function logoutSession() {
  if (logoutPromise) return logoutPromise;
  const token = accessToken;
  const user = getSessionUser();
  const intentId = setSignOutState(true);
  clearSession("logout");
  // Cleanup can free storage that was full when intent was first recorded.
  // Retry the same token-free intent once before making the server request.
  if (!storageWriteHealthy) setSignOutState(true, intentId);
  if (token && user)
    void fetch(`${API_CONFIG.USER_API}/api/feed/nowplaying/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "X-Spotibuds-Request": "1" },
      credentials: "include",
      keepalive: true,
      signal: AbortSignal.timeout(2000),
    }).catch(() => undefined);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  logoutPromise = (async () => {
    try {
      await cookieOperation(controller.signal, async () => {
        const response = await fetch(`${API_CONFIG.IDENTITY_API}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: {
            "X-Spotibuds-Request": "1",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Local sign-out completed, but the server session could not be revoked. Retry sign-out when Identity is available."
          );
        // A later sign-out or successful login owns any subsequent marker.
        if (getSignOutState()?.id === intentId) setSignOutState(false, intentId);
      });
    } finally {
      clearTimeout(timer);
      logoutPromise = null;
    }
  })();
  return logoutPromise;
}
export async function beginLogin(waitForLogout = true) {
  if (waitForLogout && logoutPromise) await logoutPromise.catch(() => undefined);
  if (!getSignOutState()) setSignOutState(false);
  clearSession("account-switch");
  return generation;
}
if (typeof window !== "undefined") {
  for (const key of ["token", "refreshToken"]) {
    try {
      localStorage.removeItem(key);
    } catch {
      storageWriteHealthy = false;
      /* Blocked storage cannot stop module initialization. */
    }
  }
  window.addEventListener("storage", event => {
    if (event.key === SIGN_OUT_KEY) {
      try {
        // A delayed event cannot invalidate a later successful login.
        if (localStorage.getItem(SIGN_OUT_KEY) !== event.newValue) return;
      } catch {
        storageWriteHealthy = false;
      }
      let statusOnly = false;
      try {
        const previous = JSON.parse(event.oldValue || "null");
        const next = JSON.parse(event.newValue || "null");
        statusOnly = !!previous?.id && previous.id === next?.id && !accessToken;
      } catch {
        /* Invalid intent events still clear ownership. */
      }
      signOutIntent = null;
      explicitLogin = false;
      if (event.newValue !== null && !statusOnly) clearSession("other-tab", false);
      else notify("sign-out-status");
    }
    if (event.key === "spotibuds:session-change") {
      let reason = "other-tab";
      try {
        if (JSON.parse(event.newValue || "null")?.reason === "renewal-unavailable")
          reason = "renewal-unavailable";
      } catch {
        /* Invalid events still clear local ownership. */
      }
      clearSession(reason, false);
    }
  });
}

import { API_CONFIG } from "./config";
import {
  ensureAccessToken,
  refreshSession,
  getSessionUser,
  getSessionGeneration,
  registerRequest,
  clearSession,
} from "./session";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
async function responseError(response: Response) {
  const text = await response.text();
  try {
    const value = JSON.parse(text);
    const errors = value.errors ? Object.values(value.errors).flat().join(" ") : "";
    return new ApiError(
      value.message ||
        value.detail ||
        errors ||
        value.title ||
        `Request failed (${response.status})`,
      response.status
    );
  } catch {
    return new ApiError(
      text.slice(0, 500) || `Request failed (${response.status})`,
      response.status
    );
  }
}
export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const origin = new URL(url).origin;
  if (!Object.values(API_CONFIG).some(base => new URL(base).origin === origin))
    throw new Error("The request destination is not a configured API.");
  const publicAuth = /\/api\/auth\/(login|register|forgot-password|reset-password)$/.test(
    new URL(url).pathname
  );
  const expectedGeneration = getSessionGeneration();
  let token = publicAuth || !getSessionUser() ? null : await ensureAccessToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (getSessionGeneration() !== expectedGeneration)
      throw new Error("The session changed. Please retry.");
    const controller = new AbortController();
    const unregister = registerRequest(controller);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(onAbort, 30000);
    try {
      const headers = new Headers(options.headers);
      if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      // Never carry a caller's stale credential into a retry.
      headers.delete("Authorization");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      headers.set("X-Spotibuds-Request", "1");
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (getSessionGeneration() !== expectedGeneration)
        throw new Error("The session changed. Please retry.");
      if (response.status === 401 && !publicAuth && attempt === 0 && getSessionUser()) {
        token = await refreshSession();
        if (token) continue;
      }
      if (!response.ok) {
        if (response.status === 401 && !publicAuth) clearSession("expired");
        throw await responseError(response);
      }
      if (response.status === 204) return undefined as T;
      if (response.headers.get("Content-Type")?.startsWith("image/"))
        return (await response.blob()) as T;
      const text = await response.text();
      if (!text) return undefined as T;
      if (response.headers.get("Content-Type")?.includes("json")) return JSON.parse(text) as T;
      return text as T;
    } catch (error) {
      if (error instanceof TypeError)
        throw new ApiError("The service is unavailable. Check the local stack and retry.", 503);
      if (error instanceof Error && error.name === "AbortError" && !options.signal?.aborted)
        throw new ApiError(
          "The request was interrupted or timed out. Retry when the service is available.",
          503
        );
      throw error;
    } finally {
      clearTimeout(timer);
      unregister();
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new ApiError("Authentication failed. Please sign in again.", 401);
}

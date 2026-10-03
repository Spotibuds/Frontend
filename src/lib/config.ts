// NEXT_PUBLIC values are compiled into browser assets. There is no remote fallback.
function apiUrl(value: string | undefined, name: string, local: string): string {
  if (!value && process.env.NODE_ENV === "production")
    throw new Error(`${name} is required at build time`);
  const url = new URL(value || local);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(`${name} must be an HTTP origin`);
  return url.toString().replace(/\/$/, "");
}
export const API_CONFIG = {
  IDENTITY_API: apiUrl(
    process.env.NEXT_PUBLIC_IDENTITY_API,
    "NEXT_PUBLIC_IDENTITY_API",
    "http://127.0.0.1:5101"
  ),
  MUSIC_API: apiUrl(
    process.env.NEXT_PUBLIC_MUSIC_API,
    "NEXT_PUBLIC_MUSIC_API",
    "http://127.0.0.1:5102"
  ),
  USER_API: apiUrl(
    process.env.NEXT_PUBLIC_USER_API,
    "NEXT_PUBLIC_USER_API",
    "http://127.0.0.1:5103"
  ),
};

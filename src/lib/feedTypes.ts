export interface FeedPost {
  id?: string;
  postId?: string;
  type: string;
  identityUserId: string;
  username?: string;
  displayName?: string;
  songId?: string;
  songTitle?: string;
  artist?: string;
  coverUrl?: string;
  playedAt?: string;
  updatedAt?: string;
  topArtists?: Array<{ name: string; count: number }>;
  topSongs?: Array<{ songId?: string; songTitle?: string; artist?: string; count: number }>;
  commonArtists?: string[];
  withIdentityUserId?: string;
}
export interface FeedReaction {
  emoji: string;
  fromIdentityUserId: string;
  fromUserName?: string;
  createdAt: string;
}

// App Router parameters may arrive decoded or percent-encoded after client navigation.
// Decode one path segment before the API performs its own query encoding.
export function decodePostRouteId(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && decoded.length <= 200 && !/[\u0000-\u001f\u007f]/.test(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}

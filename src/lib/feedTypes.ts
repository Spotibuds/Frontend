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

export interface FeedPageResponse {
  items: FeedSlide[];
  nextCursor: string | null;
  hasMore: boolean;
}
export interface FeedReactionSummary {
  postId: string;
  total: number;
  counts: Array<{ emoji: string; count: number }>;
  myEmojis: string[];
}
export interface FeedReactionPeople {
  items: Array<FeedReaction & { postId?: string; toIdentityUserId: string }>;
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export type FeedSlide =
  | {
      type: "recent_song";
      identityUserId: string;
      postId?: string;
      username?: string;
      displayName?: string;
      songId: string;
      songTitle?: string;
      artist?: string;
      coverUrl?: string;
      playedAt?: string;
    }
  | {
      type: "now_playing";
      identityUserId: string;
      postId?: string;
      username?: string;
      displayName?: string;
      songId: string;
      songTitle?: string;
      artist?: string;
      coverUrl?: string;
      positionSec?: number;
      updatedAt?: string;
    }
  | {
      type: "top_artists_week";
      identityUserId: string;
      postId?: string;
      username?: string;
      displayName?: string;
      topArtists: Array<{ name: string; count: number }>;
    }
  | {
      type: "common_artists";
      identityUserId: string;
      postId?: string;
      withIdentityUserId: string;
      username?: string;
      displayName?: string;
      commonArtists: string[];
    }
  | {
      type: "top_songs_week";
      identityUserId: string;
      postId?: string;
      username?: string;
      displayName?: string;
      topSongs: Array<{ songId?: string; songTitle?: string; artist?: string; count: number }>;
    };

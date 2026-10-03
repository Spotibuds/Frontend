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

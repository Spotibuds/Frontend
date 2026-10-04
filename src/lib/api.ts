import type {
  FeedPost,
  FeedPageResponse,
  FeedReactionSummary,
  FeedReactionPeople,
} from "./feedTypes";
import { API_CONFIG } from "./config";
import { apiRequest } from "./request";
import { getSessionUser, ensureAccessToken, loginSession, logoutSession } from "./session";
export { API_CONFIG, apiRequest };
export function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) return "";
  if (originalUrl.startsWith("/") || !originalUrl.includes("://")) return originalUrl;
  if (originalUrl.includes("/api/media/image?url=")) return originalUrl;
  if (
    originalUrl.includes("blob.core.windows.net") ||
    /https?:\/\/(127\.0\.0\.1|localhost|azurite):10000\//.test(originalUrl)
  )
    return `${API_CONFIG.MUSIC_API}/api/media/image?url=${encodeURIComponent(originalUrl)}`;
  return originalUrl;
}

export function getImageFallback(
  title?: string,
  type: "album" | "artist" | "song" | "user" = "album"
): string {
  const fallbackChar =
    title?.charAt(0)?.toUpperCase() ||
    (type === "album" ? "A" : type === "artist" ? "♪" : type === "song" ? "♫" : "U");
  return fallbackChar;
}

export function getPlaceholderImageUrl(
  type: "album" | "artist" | "song" | "user",
  size: number = 400
): string {
  return `https://via.placeholder.com/${size}x${size}/1f2937/ffffff?text=${type.charAt(0).toUpperCase()}`;
}

// Types
export interface Artist {
  id: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  albums?: string[];
  createdAt?: string;
}

export interface Song {
  id: string;
  title: string;
  artists: Array<{ id: string; name: string }>;
  genre?: string;
  durationSec: number;
  album?: { id: string; title: string };
  fileUrl?: string;
  snippetUrl?: string;
  coverUrl?: string;
  createdAt?: string;
  releaseDate?: string;
}

export interface Album {
  id: string;
  title: string;
  songs: Array<{ id: string; position: number; addedAt: string }>;
  artist?: { id: string; name: string };
  coverUrl?: string;
  releaseDate?: string;
  createdAt?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songs: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email?: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
  followers?: number;
  following?: number;
  playlists?: number;
  roles?: string[];
}

export interface UserAdmin {
  id: string;
  email?: string;
  userName: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
  followers?: number;
  following?: number;
  playlists?: number;
  roles?: string[];
}

export interface UserDto {
  id: string;
  identityUserId: string;
  userName: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  playlists: { id: string }[];
  followedUsers: { id: string }[];
  followers: { id: string }[];
  isPrivate: boolean;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  name?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    isPrivate: boolean;
    createdAt: string;
    roles: string[];
  };
}

export interface RegisterResponse {
  message: string;
  userId: string;
}

// Friend and Chat Types
export interface FriendRequest {
  requestId: string;
  requesterId: string;
  requesterUsername: string;
  requesterAvatar?: string;
  requestedAt: string;
}
export interface SentFriendRequest {
  requestId: string;
  addresseeId: string;
  addresseeUsername: string;
  addresseeAvatar?: string;
  requestedAt: string;
}

export interface Friend {
  id: string;
  userId: string;
  username: string;
  name?: string;
  acceptedAt?: string;
  lastMessageAt?: string | null;
  isOnline?: boolean;
}

export interface FriendshipStatus {
  status: "none" | "pending" | "accepted" | "blocked" | "declined";
  friendshipId?: string;
  requesterId?: string;
  addresseeId?: string;
  requestedAt?: string;
  respondedAt?: string;
}

export interface Chat {
  chatId: string;
  isGroup: boolean;
  name?: string;
  participants: string[];
  lastActivity: string;
  lastMessageId?: string;
  lastMessageContent?: string;
  lastMessageSenderId?: string;
}

export interface ChatParticipant {
  userId: string;
  username: string;
}

export interface Message {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  content: string;
  type: string;
  sentAt: string;
  isEdited: boolean;
  editedAt?: string;
  readBy: MessageRead[];
  isRead?: boolean;
  replyToId?: string;
}

export interface MessageRead {
  userId: string;
  readAt: string;
}
export interface UpdatePlaylistDto {
  Name: string;
  Description: string;
}

export const identityApi = {
  register: (data: RegisterRequest) =>
    apiRequest<RegisterResponse>(`${API_CONFIG.IDENTITY_API}/api/auth/register`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    return loginSession(signal =>
      apiRequest<AuthResponse>(`${API_CONFIG.IDENTITY_API}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify(data),
        signal,
      })
    );
  },
  getCurrentUser: getSessionUser,
  getCurrentUserWithTokenCheck: async (): Promise<User | null> => {
    const token = await ensureAccessToken();
    if (!token) return null;
    return getSessionUser();
  },
  logout: logoutSession,
  forgotPassword: (email: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.IDENTITY_API}/api/auth/forgot-password`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, token: string, password: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.IDENTITY_API}/api/auth/reset-password`, {
      method: "POST",
      body: JSON.stringify({ email, token, password }),
    }),
};

export const musicApi = {
  updatePlaylist: async (id: string, dto: UpdatePlaylistDto): Promise<boolean> => {
    await apiRequest<void>(`${API_CONFIG.MUSIC_API}/api/playlists/${id}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
    return true;
  },

  async getSongs(limit?: number, skip = 0): Promise<Song[]> {
    try {
      const url = limit
        ? `${API_CONFIG.MUSIC_API}/api/songs?limit=${limit}`
        : `${API_CONFIG.MUSIC_API}/api/songs`;
      const response = await apiRequest<Song[]>(
        skip ? `${url}${limit ? "&" : "?"}skip=${skip}` : url
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch songs:", error);
      throw error;
    }
  },

  async getSong(id: string): Promise<Song | null> {
    try {
      const response = await apiRequest<Song>(`${API_CONFIG.MUSIC_API}/api/songs/${id}`);
      return response;
    } catch (error) {
      console.warn("Failed to fetch song:", error);
      throw error;
    }
  },

  async getAlbums(limit?: number, skip = 0): Promise<Album[]> {
    try {
      const url = limit
        ? `${API_CONFIG.MUSIC_API}/api/albums?limit=${limit}`
        : `${API_CONFIG.MUSIC_API}/api/albums`;
      const response = await apiRequest<Album[]>(
        skip ? `${url}${limit ? "&" : "?"}skip=${skip}` : url
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch albums:", error);
      throw error;
    }
  },

  async getArtists(limit?: number, skip = 0): Promise<Artist[]> {
    try {
      const url = limit
        ? `${API_CONFIG.MUSIC_API}/api/artists?limit=${limit}`
        : `${API_CONFIG.MUSIC_API}/api/artists`;
      const response = await apiRequest<Artist[]>(
        skip ? `${url}${limit ? "&" : "?"}skip=${skip}` : url
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch artists:", error);
      throw error;
    }
  },

  async getAlbum(id: string): Promise<Album> {
    try {
      const response = await apiRequest<Album>(`${API_CONFIG.MUSIC_API}/api/albums/${id}`);
      return response;
    } catch (error) {
      console.error("Failed to fetch album:", error);
      throw error;
    }
  },

  async getArtist(id: string, signal?: AbortSignal): Promise<Artist> {
    try {
      const response = await apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/artists/${id}`, {
        signal,
      });
      return response;
    } catch (error) {
      console.error("Failed to fetch artist:", error);
      throw error;
    }
  },

  async getArtistAlbums(artistId: string, limit?: number, signal?: AbortSignal): Promise<Album[]> {
    try {
      const url = limit
        ? `${API_CONFIG.MUSIC_API}/api/artists/${artistId}/albums?limit=${limit}`
        : `${API_CONFIG.MUSIC_API}/api/artists/${artistId}/albums`;
      const response = await apiRequest<Album[]>(url, { signal });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch artist albums:", error);
      throw error;
    }
  },

  async getArtistSongs(artistId: string, limit?: number, signal?: AbortSignal): Promise<Song[]> {
    try {
      const url = limit
        ? `${API_CONFIG.MUSIC_API}/api/artists/${artistId}/songs?limit=${limit}`
        : `${API_CONFIG.MUSIC_API}/api/artists/${artistId}/songs`;
      const response = await apiRequest<Song[]>(url, { signal });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch artist songs:", error);
      throw error;
    }
  },

  async getAlbumSongs(albumId: string): Promise<Song[]> {
    try {
      const response = await apiRequest<Song[]>(
        `${API_CONFIG.MUSIC_API}/api/albums/${albumId}/songs`
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch album songs:", error);
      throw error;
    }
  },

  async searchContent(
    query: string,
    signal?: AbortSignal
  ): Promise<{ songs: Song[]; albums: Album[]; artists: Artist[] }> {
    return apiRequest(`${API_CONFIG.MUSIC_API}/api/search?q=${encodeURIComponent(query)}`, {
      signal,
    });
  },

  // Playlist cover image functions
  async uploadPlaylistCover(playlistId: string, file: File): Promise<{ coverUrl: string }> {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest(`${API_CONFIG.MUSIC_API}/api/playlists/${playlistId}/cover`, {
      method: "POST",
      body: formData,
    });
  },
  deletePlaylistCover: (playlistId: string) =>
    apiRequest<void>(`${API_CONFIG.MUSIC_API}/api/playlists/${playlistId}/cover`, {
      method: "DELETE",
    }),
};

export const userApi = {
  // User profile methods
  getUserProfile: (userId: string): Promise<User> => userApi.getUserProfileByIdentityId(userId),

  getUserProfileByIdentityId: async (
    identityUserId: string
  ): Promise<User & { createdAt?: string }> => {
    try {
      const userData = await apiRequest<UserDto>(
        `${API_CONFIG.USER_API}/api/users/identity/${identityUserId}`
      );
      return {
        id: userData.identityUserId, // Use IdentityUserId for consistency with API calls
        username: userData.userName,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        followers: userData.followers?.length || 0,
        following: userData.followedUsers?.length || 0,
        playlists: userData.playlists?.length || 0, // Convert to count
        isPrivate: userData.isPrivate,
        createdAt: userData.createdAt,
      };
    } catch (error) {
      throw error;
    }
  },

  getUserProfilesBatch: async (userIds: string[]): Promise<User[]> => {
    try {
      const ids = [...new Set(userIds)];
      const userDtos: UserDto[] = [];
      for (let offset = 0; offset < ids.length; offset += 50) {
        userDtos.push(
          ...(await apiRequest<UserDto[]>(`${API_CONFIG.USER_API}/api/users/batch`, {
            method: "POST",
            body: JSON.stringify({ userIds: ids.slice(offset, offset + 50) }),
          }))
        );
      }

      return userDtos.map(userData => ({
        id: userData.identityUserId, // Use IdentityUserId for consistency with API calls
        username: userData.userName,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        followers: userData.followers?.length || 0,
        following: userData.followedUsers?.length || 0,
        playlists: userData.playlists?.length || 0, // Convert to count
        isPrivate: userData.isPrivate,
        createdAt: userData.createdAt,
      }));
    } catch (error) {
      throw error;
    }
  },

  getAllUsers: () => apiRequest<UserDto[]>(`${API_CONFIG.USER_API}/api/users`),

  updateUserProfile: (userId: string, data: Partial<User>) =>
    apiRequest<User>(`${API_CONFIG.USER_API}/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateUserProfileByIdentityId: (
    identityUserId: string,
    data: {
      username?: string;
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
      isPrivate?: boolean;
    }
  ) => {
    const { username, ...profile } = data;
    return apiRequest<void>(`${API_CONFIG.USER_API}/api/users/identity/${identityUserId}`, {
      method: "PUT",
      body: JSON.stringify({ ...profile, userName: username }),
    });
  },

  // Friend management
  sendFriendRequest: (requesterId: string, addresseeId: string) => {
    // Note: requesterId is ignored since backend gets user ID from JWT token
    const requestBody = { targetUserId: addresseeId };
    return apiRequest<{ message: string; friendshipId: string }>(
      `${API_CONFIG.USER_API}/api/friends/request`,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      }
    );
  },

  acceptFriendRequest: (friendshipId: string, addresseeId: string) => {
    return apiRequest<{ message: string }>(
      `${API_CONFIG.USER_API}/api/friends/${friendshipId}/accept`,
      {
        method: "POST",
        body: JSON.stringify({ userId: addresseeId }),
      }
    );
  },

  declineFriendRequest: (friendshipId: string, addresseeId: string) => {
    return apiRequest<{ message: string }>(
      `${API_CONFIG.USER_API}/api/friends/${friendshipId}/decline`,
      {
        method: "POST",
        body: JSON.stringify({ userId: addresseeId }),
      }
    );
  },

  removeFriend: (friendshipId: string, userId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/${friendshipId}`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    }),

  blockUser: (friendshipId: string, blockerId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/${friendshipId}/block`, {
      method: "POST",
      body: JSON.stringify({ blockerId }),
    }),

  getFriends: (userId: string) =>
    apiRequest<string[]>(`${API_CONFIG.USER_API}/api/friends/${userId}`),

  getPendingFriendRequests: (userId: string) =>
    apiRequest<FriendRequest[]>(`${API_CONFIG.USER_API}/api/friends/pending/${userId}`),

  getSentFriendRequests: (userId: string) =>
    apiRequest<SentFriendRequest[]>(`${API_CONFIG.USER_API}/api/friends/sent/${userId}`),

  cancelFriendRequest: (requestId: string) =>
    apiRequest<{ message: string }>(
      `${API_CONFIG.USER_API}/api/friends/${requestId}?pendingOnly=true`,
      { method: "DELETE" }
    ),

  getFriendshipStatus: (userId1: string, userId2: string) =>
    apiRequest<FriendshipStatus>(
      `${API_CONFIG.USER_API}/api/friends/status?userId1=${userId1}&userId2=${userId2}`
    ),

  // Chat management
  createOrGetChat: (participantIds: string[], isGroup = false, name?: string) =>
    apiRequest<Chat>(`${API_CONFIG.USER_API}/api/chats/create-or-get`, {
      method: "POST",
      body: JSON.stringify({ participantIds, isGroup, name }),
    }),

  getChat: (chatId: string) => apiRequest<Chat>(`${API_CONFIG.USER_API}/api/chats/${chatId}`),

  getUserChats: (userId: string) =>
    apiRequest<Chat[]>(`${API_CONFIG.USER_API}/api/chats/user/${userId}`),

  getChatMessages: (chatId: string, page = 1, pageSize = 50, before?: string) =>
    apiRequest<Message[]>(
      `${API_CONFIG.USER_API}/api/chats/${chatId}/messages?page=${page}&pageSize=${pageSize}${before ? `&before=${encodeURIComponent(before)}` : ""}`
    ),

  sendMessage: (chatId: string, content: string, type = "Text", replyToId?: string) =>
    apiRequest<Message>(`${API_CONFIG.USER_API}/api/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, type, replyToId }),
    }),

  markMessageAsRead: (messageId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/chats/messages/${messageId}/read`, {
      method: "POST",
    }),

  deleteChat: (chatId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/chats/${chatId}`, {
      method: "DELETE",
    }),

  // Unread message tracking
  getUnreadMessageCounts: () =>
    apiRequest<Record<string, number>>(`${API_CONFIG.USER_API}/api/chats/unread-counts`),

  getChatUnreadCount: (chatId: string) =>
    apiRequest<number>(`${API_CONFIG.USER_API}/api/chats/${chatId}/unread-count`),

  markAllMessagesAsRead: (chatId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/chats/${chatId}/mark-all-read`, {
      method: "POST",
    }),

  // Legacy follow functionality (keeping for compatibility)
  followUser: (followerId: string, followedId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/follows`, {
      method: "POST",
      body: JSON.stringify({ followerId, followedId }),
    }),

  unfollowUser: (followerId: string, followedId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/follows`, {
      method: "DELETE",
      body: JSON.stringify({ followerId, followedId }),
    }),

  getFollowers: (userId: string) =>
    apiRequest<string[]>(`${API_CONFIG.USER_API}/api/follows/${userId}/followers`),

  getFollowing: (userId: string) =>
    apiRequest<string[]>(`${API_CONFIG.USER_API}/api/follows/${userId}/following`),

  checkIfFollowing: (followerId: string, followedId: string) =>
    apiRequest<boolean>(
      `${API_CONFIG.USER_API}/api/follows/check?followerId=${followerId}&followedId=${followedId}`
    ),

  getFollowStats: (userId: string) =>
    apiRequest<FollowStats>(`${API_CONFIG.USER_API}/api/follows/${userId}/stats`),

  // Search functionality
  searchUsers: async (query: string, signal?: AbortSignal): Promise<User[]> => {
    try {
      const userDtos = await apiRequest<UserDto[]>(
        `${API_CONFIG.USER_API}/api/users/search?q=${encodeURIComponent(query)}`,
        { signal }
      );

      // Map UserDto to User interface - use IdentityUserId as the id for consistency
      return userDtos.map(dto => ({
        id: dto.identityUserId, // Use IdentityUserId instead of MongoDB _id
        username: dto.userName,
        displayName: dto.displayName,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        isPrivate: dto.isPrivate,
        followers: dto.followers?.length || 0,
        following: dto.followedUsers?.length || 0,
        playlists: dto.playlists?.length || 0,
      }));
    } catch (error) {
      console.warn("User search failed:", error);
      throw error;
    }
  },

  // Get current user profile with IdentityUserId
  getCurrentUserProfile: async (): Promise<User | null> => {
    try {
      const currentUser = identityApi.getCurrentUser();
      if (!currentUser) return null;

      // Get the full user profile which includes the MongoDB _id
      // Use the IdentityUserId to fetch the user profile
      const userData = await apiRequest<UserDto>(
        `${API_CONFIG.USER_API}/api/users/identity/${currentUser.id}`
      );
      return {
        id: userData.identityUserId, // Use IdentityUserId for consistency with API calls
        username: userData.userName,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        followers: userData.followers?.length || 0,
        following: userData.followedUsers?.length || 0,
        playlists: userData.playlists?.length || 0,
        isPrivate: userData.isPrivate,
      };
    } catch (error) {
      console.error("Failed to get current user profile:", error);
      throw error;
    }
  },

  // Listening History methods
  addToListeningHistory: (
    userId: string,
    songData: {
      songId: string;
      songTitle: string;
      artist: string;
      coverUrl?: string;
      duration?: number;
    }
  ) =>
    apiRequest<{ message: string }>(
      `${API_CONFIG.USER_API}/api/users/identity/${userId}/listening-history`,
      {
        method: "POST",
        body: JSON.stringify(songData),
      }
    ),

  getListeningHistory: (userId: string, limit = 50, skip = 0, signal?: AbortSignal) =>
    apiRequest<
      Array<{
        songId: string;
        songTitle: string;
        artist: string;
        duration?: number;
        playedAt: string;
      }>
    >(
      `${API_CONFIG.USER_API}/api/users/identity/${userId}/listening-history?limit=${limit}&skip=${skip}`,
      { signal }
    ),

  // Weekly Top Artists (current week, cached server-side)
  getWeeklyTopArtists: (identityUserId: string) =>
    apiRequest<Array<{ name: string; count: number }>>(
      `${API_CONFIG.USER_API}/api/users/identity/${identityUserId}/top-artists/week/current`
    ),

  // Feed slides
  getFeedSlides: (identityUserId: string, limit = 20, skip = 0) =>
    apiRequest<Array<Record<string, unknown>>>(
      `${API_CONFIG.USER_API}/api/feed/slides?identityUserId=${identityUserId}&limit=${limit}&skip=${skip}`
    ),

  getFeedPage: (identityUserId: string, limit = 10, cursor?: string | null, signal?: AbortSignal) =>
    apiRequest<FeedPageResponse>(
      `${API_CONFIG.USER_API}/api/feed/slides/page?identityUserId=${encodeURIComponent(identityUserId)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal }
    ),

  getFeedReactionSummary: (postId: string, signal?: AbortSignal) =>
    apiRequest<FeedReactionSummary>(
      `${API_CONFIG.USER_API}/api/feed/reactions/summary?postId=${encodeURIComponent(postId)}`,
      { signal }
    ),
  getFeedReactionPeople: (postId: string, cursor?: string | null, signal?: AbortSignal) =>
    apiRequest<FeedReactionPeople>(
      `${API_CONFIG.USER_API}/api/feed/reactions/people?postId=${encodeURIComponent(postId)}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { signal }
    ),

  // Reactions
  sendReaction: (payload: {
    toIdentityUserId: string;
    fromIdentityUserId: string;
    fromUserName?: string;
    emoji: string;
    contextType?: string;
    songId?: string;
    songTitle?: string;
    artist?: string;
    postId?: string;
  }) =>
    apiRequest<{ success: boolean; message: string; action: "added" | "removed"; postId: string }>(
      `${API_CONFIG.USER_API}/api/feed/reactions`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  getLatestReactions: (identityUserId: string, limit = 20, skip = 0) =>
    apiRequest<
      Array<{
        toIdentityUserId: string;
        fromIdentityUserId: string;
        fromUserName?: string;
        emoji: string;
        createdAt: string;
        contextType?: string;
        songId?: string;
        songTitle?: string;
        artist?: string;
        postId?: string;
      }>
    >(
      `${API_CONFIG.USER_API}/api/feed/reactions/latest?identityUserId=${identityUserId}&limit=${limit}&skip=${skip}`
    ),

  getReactionsByPost: (postId: string, currentUserId?: string) =>
    apiRequest<
      Array<{
        toIdentityUserId: string;
        fromIdentityUserId: string;
        fromUserName?: string;
        emoji: string;
        createdAt: string;
        contextType?: string;
        songId?: string;
        songTitle?: string;
        artist?: string;
        postId?: string;
      }>
    >(
      `${API_CONFIG.USER_API}/api/feed/reactions/by-post?postId=${encodeURIComponent(postId)}${currentUserId ? `&currentUserId=${encodeURIComponent(currentUserId)}` : ""}`
    ),

  getPostById: (postId: string, currentUserId?: string) =>
    apiRequest<FeedPost>(
      `${API_CONFIG.USER_API}/api/feed/post?id=${encodeURIComponent(postId)}${currentUserId ? `&currentUserId=${encodeURIComponent(currentUserId)}` : ""}`
    ),

  // Now Playing
  setNowPlaying: (
    payload: {
      identityUserId: string;
      songId: string;
      songTitle?: string;
      artist?: string;
      coverUrl?: string;
      positionSec?: number;
      isPlaying?: boolean;
    },
    ttlSec = 90
  ) =>
    apiRequest<{ success: boolean }>(
      `${API_CONFIG.USER_API}/api/feed/nowplaying?ttlSec=${ttlSec}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  getNowPlayingBatch: (userIds: string[]) =>
    apiRequest<
      Array<{
        identityUserId: string;
        songId: string;
        songTitle?: string;
        artist?: string;
        coverUrl?: string;
        positionSec?: number;
        isPlaying?: boolean;
        updatedAt: string;
      }>
    >(`${API_CONFIG.USER_API}/api/feed/nowplaying/batch`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),

  clearNowPlaying: (identityUserId: string) =>
    apiRequest<{ success: boolean }>(
      `${API_CONFIG.USER_API}/api/feed/nowplaying/${encodeURIComponent(identityUserId)}`,
      {
        method: "DELETE",
      }
    ),

  uploadProfilePicture: (userId: string, file: File): Promise<{ avatarUrl: string }> =>
    userApi.uploadProfilePictureByIdentityId(userId, file),
  uploadProfilePictureByIdentityId: (
    identityUserId: string,
    file: File
  ): Promise<{ avatarUrl: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest(
      `${API_CONFIG.USER_API}/api/users/identity/${identityUserId}/profile-picture`,
      { method: "POST", body: formData }
    );
  },
};

export interface FollowStats {
  userId: string;
  followerCount: number;
  followingCount: number;
}

export function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("name" in obj && typeof obj.name === "string") return obj.name;
    if ("title" in obj && typeof obj.title === "string") return obj.title;
  }
  return String(value);
}

export function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;
  return [];
}

export function processArtists(artists: unknown): string[] {
  if (!artists) return ["Unknown Artist"];
  if (Array.isArray(artists)) {
    return artists.map((artist: unknown) => {
      if (typeof artist === "string") return artist;
      if (typeof artist === "object" && artist !== null) {
        const obj = artist as Record<string, unknown>;
        if ("name" in obj && typeof obj.name === "string") return obj.name;
      }
      return "Unknown Artist";
    });
  }
  if (typeof artists === "string") return [artists];
  if (typeof artists === "object" && artists !== null) {
    const obj = artists as Record<string, unknown>;
    if ("name" in obj && typeof obj.name === "string") return [obj.name];
  }
  return ["Unknown Artist"];
}

// Admin API
export const adminApi = {
  // SONGS
  async createSong(data: FormData): Promise<Song | null> {
    return apiRequest<Song>(`${API_CONFIG.MUSIC_API}/api/admin/songs`, {
      method: "POST",
      body: data,
    });
  },

  async updateSong(id: string, data: FormData): Promise<Song | null> {
    return apiRequest<Song>(`${API_CONFIG.MUSIC_API}/api/admin/songs/${id}`, {
      method: "PUT",
      body: data,
    });
  },

  async deleteSong(id: string): Promise<boolean> {
    try {
      await apiRequest(`${API_CONFIG.MUSIC_API}/api/admin/songs/${id}`, { method: "DELETE" });
      return true;
    } catch (error) {
      console.error("Failed to delete song:", error);
      throw error;
    }
  },

  // ALBUMS
  async createAlbum(data: FormData): Promise<Album | null> {
    return apiRequest<Album>(`${API_CONFIG.MUSIC_API}/api/admin/albums`, {
      method: "POST",
      body: data,
    });
  },

  async updateAlbum(id: string, data: FormData): Promise<Album | null> {
    return apiRequest<Album>(`${API_CONFIG.MUSIC_API}/api/admin/albums/${id}`, {
      method: "PUT",
      body: data,
    });
  },

  async deleteAlbum(id: string): Promise<boolean> {
    try {
      await apiRequest(`${API_CONFIG.MUSIC_API}/api/admin/albums/${id}`, { method: "DELETE" });
      return true;
    } catch (error) {
      console.error("Failed to delete album:", error);
      throw error;
    }
  },

  // ARTISTS
  async createArtist(data: FormData): Promise<Artist | null> {
    return apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/admin/artists`, {
      method: "POST",
      body: data,
    });
  },

  async updateArtist(id: string, data: FormData): Promise<Artist | null> {
    return apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/admin/artists/${id}`, {
      method: "PUT",
      body: data,
    });
  },

  async deleteArtist(id: string): Promise<boolean> {
    try {
      await apiRequest(`${API_CONFIG.MUSIC_API}/api/admin/artists/${id}`, { method: "DELETE" });
      return true;
    } catch (error) {
      console.error("Failed to delete artist:", error);
      throw error;
    }
  },

  // PLAYLISTS
  async createPlaylist(description: string, name: string): Promise<Playlist | null> {
    try {
      return await apiRequest<Playlist>(`${API_CONFIG.MUSIC_API}/api/admin/playlists`, {
        method: "POST",
        body: JSON.stringify({ description, name }),
      });
    } catch (error) {
      console.error("Failed to create playlist:", error);
      throw error;
    }
  },

  async deletePlaylist(id: string): Promise<boolean> {
    try {
      await apiRequest<void>(`${API_CONFIG.MUSIC_API}/api/admin/playlists/${id}`, {
        method: "DELETE",
      });
      return true;
    } catch (error) {
      console.error("Failed to delete playlist:", error);
      throw error;
    }
  },

  async getPlaylists(limit?: number): Promise<Playlist[]> {
    try {
      const url = limit
        ? `${API_CONFIG.MUSIC_API}/api/admin/playlists?limit=${limit}`
        : `${API_CONFIG.MUSIC_API}/api/admin/playlists`;
      const response = await apiRequest<Playlist[]>(url);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch playlists:", error);
      throw error;
    }
  },

  async getPlaylist(id: string): Promise<Playlist | null> {
    try {
      return await apiRequest<Playlist>(`${API_CONFIG.MUSIC_API}/api/admin/playlists/${id}`);
    } catch (error) {
      console.warn("Failed to fetch playlist:", error);
      throw error;
    }
  },

  async getPlaylistSongs(playlistId: string): Promise<Song[]> {
    try {
      const response = await apiRequest<Song[]>(
        `${API_CONFIG.MUSIC_API}/api/admin/playlists/${playlistId}/songs`
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn("Failed to fetch playlist songs:", error);
      throw error;
    }
  },

  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<boolean> {
    try {
      await apiRequest<void>(
        `${API_CONFIG.MUSIC_API}/api/admin/playlists/${playlistId}/songs/${songId}`,
        {
          method: "DELETE",
        }
      );
      return true;
    } catch (error) {
      console.error("Failed to remove song from playlist:", error);
      throw error;
    }
  },

  async getAllUsers(): Promise<UserAdmin[]> {
    const response = await apiRequest<{
      users: Array<User & { userName?: string }>;
      totalCount: number;
    }>(`${API_CONFIG.IDENTITY_API}/api/auth/users?page=1&pageSize=100`);
    return response.users.map(user => ({
      ...user,
      userName: user.username || user.userName || "",
    }));
  },
  async getAllAdmins(): Promise<UserAdmin[]> {
    const response = await apiRequest<{
      users: Array<User & { userName?: string }>;
      totalCount: number;
    }>(`${API_CONFIG.IDENTITY_API}/api/auth/admins?page=1&pageSize=100`);
    return response.users.map(user => ({
      ...user,
      userName: user.username || user.userName || "",
    }));
  },

  async updateUser(id: string, data: { userName: string; email: string }): Promise<User | null> {
    try {
      const updatedUser = await apiRequest<User>(
        `${API_CONFIG.IDENTITY_API}/api/auth/users/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        }
      );
      return updatedUser;
    } catch (error) {
      console.error(`Failed to update user ${id}:`, error);
      throw error;
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    try {
      await apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/users/${id}`, {
        method: "DELETE",
      });
      return true;
    } catch (error) {
      console.error(`Failed to delete user ${id}:`, error);
      throw error;
    }
  },

  createAdmin: (data: {
    userName: string;
    email: string;
    password: string;
  }): Promise<User | null> =>
    apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/create-admin`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  promoteUserToAdmin: async (data: { id: string }): Promise<boolean> => {
    await apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/users/${data.id}/promote-to-admin`, {
      method: "POST",
    });
    return true;
  },
  demoteToUser: async (data: { id: string }): Promise<boolean> => {
    await apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/users/${data.id}/demote-to-user`, {
      method: "POST",
    });
    return true;
  },
  createUser: (data: { userName: string; email: string; password: string }): Promise<User | null> =>
    apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/register`, {
      method: "POST",
      body: JSON.stringify({ username: data.userName, email: data.email, password: data.password }),
    }),
};

// Canonical persisted notification protocol.
export interface Notification {
  id: string;
  targetUserId: string;
  sourceUserId?: string | null;
  type:
    | "FriendRequest"
    | "FriendRequestAccepted"
    | "FriendRequestDeclined"
    | "FriendRemoved"
    | "Message"
    | "Other"
    | "Follow"
    | "Reaction";
  status: "Unread" | "Read" | "Handled";
  title: string;
  message: string;
  data: Record<string, unknown>;
  actionUrl?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  readAt?: string | null;
  handledAt?: string | null;
  dismissedAt?: string | null;
}
export interface NotificationResponse {
  notifications: Notification[];
  totalCount: number;
  unreadCount: number;
  limit: number;
  skip: number;
  nextBefore: string | null;
}
export interface NotificationCommandResult {
  message: string;
  notification: Notification | null;
  totalCount: number | null;
  unreadCount: number | null;
  throughId: string | null;
  synchronizationPending: boolean;
}
export const notificationsApi = {
  getNotifications(
    userId: string,
    limit = 50,
    skip = 0,
    before?: string
  ): Promise<NotificationResponse> {
    const query = new URLSearchParams({ limit: String(limit), skip: String(skip) });
    if (before) query.set("before", before);
    return apiRequest(`${API_CONFIG.USER_API}/api/notifications/${userId}?${query}`);
  },
  markAsRead(notificationId: string, userId: string): Promise<NotificationCommandResult> {
    return apiRequest(`${API_CONFIG.USER_API}/api/notifications/${notificationId}/read`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },
  markAsHandled(notificationId: string, userId: string): Promise<NotificationCommandResult> {
    return apiRequest(`${API_CONFIG.USER_API}/api/notifications/${notificationId}/handle`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },
  markAllAsRead(userId: string, throughId?: string): Promise<NotificationCommandResult> {
    return apiRequest(`${API_CONFIG.USER_API}/api/notifications/${userId}/read-all`, {
      method: "POST",
      body: JSON.stringify({ throughId }),
    });
  },
  cleanupNotifications(userId: string, daysOld = 30): Promise<NotificationCommandResult> {
    return apiRequest(
      `${API_CONFIG.USER_API}/api/notifications/${userId}/cleanup?daysOld=${daysOld}`,
      { method: "DELETE" }
    );
  },
  deleteNotification(notificationId: string, userId: string): Promise<NotificationCommandResult> {
    return apiRequest(
      `${API_CONFIG.USER_API}/api/notifications/${notificationId}?userId=${userId}`,
      { method: "DELETE" }
    );
  },
  deleteAllNotifications(userId: string, throughId?: string): Promise<NotificationCommandResult> {
    return apiRequest(`${API_CONFIG.USER_API}/api/notifications/${userId}/all`, {
      method: "DELETE",
      body: JSON.stringify({ throughId }),
    });
  },
};

// Production-ready API configuration
const getApiConfig = () => {
  // Check if we're in production environment
  const isProduction = process.env.NODE_ENV === 'production' || 
    (typeof window !== 'undefined' && !window.location.hostname.includes('localhost'));

  if (isProduction) {
    // Use production URLs when deployed
    return {
      IDENTITY_API: process.env.NEXT_PUBLIC_IDENTITY_API || 'https://identity-spotibuds-dta5hhc7gka0gnd3.eastasia-01.azurewebsites.net',
      MUSIC_API: process.env.NEXT_PUBLIC_MUSIC_API || 'https://music-spotibuds-ehckeeb8b5cfedfv.eastasia-01.azurewebsites.net',
      USER_API: process.env.NEXT_PUBLIC_USER_API || 'https://user-spotibuds-h7abc7b2f4h4dqcg.eastasia-01.azurewebsites.net'
    };
  } else {
    // Use localhost for development
    return {
      IDENTITY_API: process.env.NEXT_PUBLIC_IDENTITY_API || 'http://localhost:5000',
      MUSIC_API: process.env.NEXT_PUBLIC_MUSIC_API || 'http://localhost:5001',
      USER_API: process.env.NEXT_PUBLIC_USER_API || 'http://localhost:5002'
    };
  }
};

// Use runtime configuration
export const API_CONFIG = getApiConfig();

// Debug logging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.log('API Configuration:', API_CONFIG);
}

// Token management
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: string | null) => void;
  reject: (error?: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

const refreshToken = async (): Promise<string | null> => {
  const refreshTokenValue = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  
  if (!refreshTokenValue) {
    return null;
  }

  try {
    const response = await fetch(`${API_CONFIG.IDENTITY_API}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (!response.ok) {
      // Refresh token is invalid or expired
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
      return null;
    }

    const data = await response.json();
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    
    return data.token;
  } catch (error) {
    console.error('Token refresh failed:', error);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    return null;
  }
};

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Debug logging for friend requests (disabled to reduce console noise)
  // if (url.includes('/api/friends/')) {
  //   console.log('API Request Debug:', {
  //     url,
  //     method: options?.method,
  //     body: options?.body,
  //     headers: { ...defaultHeaders, ...options?.headers }
  //   });
  // }

  // Add timeout to prevent hanging - longer timeout for registration
  const controller = new AbortController();
  const isRegistration = url.includes('/api/auth/register');
  const timeoutDuration = isRegistration ? 30000 : 10000; // 30 seconds for registration, 10 seconds for others
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...defaultHeaders,
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle 401 Unauthorized - try to refresh token
      if (response.status === 401 && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login')) {
        if (isRefreshing) {
          // If already refreshing, wait for the refresh to complete
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(() => {
            // Retry the original request with new token
            return apiRequest<T>(url, options);
          });
        }

        isRefreshing = true;

        try {
          const newToken = await refreshToken();
          if (newToken) {
            processQueue(null, newToken);
            // Retry the original request with new token
            return apiRequest<T>(url, options);
          } else {
            processQueue(new Error('Token refresh failed'));
            throw new Error('Authentication failed. Please log in again.');
          }
        } finally {
          isRefreshing = false;
        }
      }

      // Try to get the error response body for all failed requests
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          // Try to parse as JSON first
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) {
              errorMessage = errorJson.message;
            } else if (errorJson.errors && Array.isArray(errorJson.errors)) {
              errorMessage = JSON.stringify(errorJson);
            } else {
              errorMessage = errorText;
            }
          } catch {
            // If not JSON, use the text as is
            errorMessage = errorText;
          }
        }
        
        // Debug logging for failed requests
        if (url.includes('/api/friends/')) {
          console.error('Friend request failed:', {
            status: response.status,
            statusText: response.statusText,
            url,
            errorMessage
          });
        }
      } catch (e) {
        // If we can't read the response body, use the generic error
        console.error('Could not read error response body:', e);
      }
      
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      const isRegistration = url.includes('/api/auth/register');
      const timeoutMessage = isRegistration 
        ? 'Registration is taking longer than expected. This might be due to high server load. Please try again in a moment.'
        : 'Request timeout - service unavailable';
      throw new Error(timeoutMessage);
    }
    throw error;
  }
}

export function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.warn('No image URL provided');
    return '';
  }
    
  if (originalUrl.startsWith('/') || originalUrl.startsWith('./') || !originalUrl.includes('://')) {
    console.log('Using local/relative URL:', originalUrl);
    return originalUrl;
  }
  
  // Check if URL is already proxied to prevent double-proxying
  if (originalUrl.includes('/api/media/image?url=')) {
    console.log('URL is already proxied:', originalUrl);
    return originalUrl;
  }
  
  if (originalUrl.includes('blob.core.windows.net')) {
    const proxyUrl = `${API_CONFIG.MUSIC_API}/api/media/image?url=${encodeURIComponent(originalUrl)}`;
    console.log('Proxying blob URL:', originalUrl, '->', proxyUrl);
    return proxyUrl;
  }
  
  if (originalUrl.startsWith('data:')) {
    console.log('Using data URL');
    return originalUrl;
  }
  
  console.log('Using direct external URL:', originalUrl);
  return originalUrl;
}

export function getImageFallback(title?: string, type: 'album' | 'artist' | 'song' | 'user' = 'album'): string {
  const fallbackChar = title?.charAt(0)?.toUpperCase() || 
                      (type === 'album' ? 'A' : type === 'artist' ? '♪' : type === 'song' ? '♫' : 'U');
  return fallbackChar;
}

export function getPlaceholderImageUrl(type: 'album' | 'artist' | 'song' | 'user', size: number = 400): string {

  
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
  refreshToken?: string;
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
  status: 'none' | 'pending' | 'accepted' | 'blocked' | 'declined';
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
  replyToId?: string;
}

export interface MessageRead {
  userId: string;
  readAt: string;
}

// API Functions
export const identityApi = {
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiRequest<RegisterResponse>(`${API_CONFIG.IDENTITY_API}/api/auth/register`, {
      method: 'POST',
        body: JSON.stringify(data),
    });
    
    // Note: Register doesn't return token/user data - that happens in the separate login call
    return response;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiRequest<AuthResponse>(`${API_CONFIG.IDENTITY_API}/api/auth/login`, {
      method: 'POST',
        body: JSON.stringify(data),
    });

    // Store token, refresh token, and user data in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('refreshToken', response.refreshToken);
      }
      localStorage.setItem('currentUser', JSON.stringify(response.user));
    }

    return response;
  },

  getCurrentUser: (): User | null => {
    if (typeof window === 'undefined') return null;
    
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
  },



  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('currentUser');
    }
  }
};

export const musicApi = {
  async testProxy(): Promise<unknown> {
    try {
              const response = await apiRequest<unknown>(`${API_CONFIG.MUSIC_API}/api/media/test`);
      return response;
    } catch (error) {
      console.warn('Proxy test failed:', error);
      return null;
    }
  },

  async getSongs(): Promise<Song[]> {
    try {
      const response = await apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/songs`);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn('Failed to fetch songs:', error);
      return [];
    }
  },

  async getAlbums(): Promise<Album[]> {
    try {
      const response = await apiRequest<Album[]>(`${API_CONFIG.MUSIC_API}/api/albums`);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn('Failed to fetch albums:', error);
      return [];
    }
  },

  async getArtists(): Promise<Artist[]> {
    try {
      const response = await apiRequest<Artist[]>(`${API_CONFIG.MUSIC_API}/api/artists`);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn('Failed to fetch artists:', error);
      return [];
    }
  },

  async getAlbum(id: string): Promise<Album> {
    try {
      const response = await apiRequest<Album>(`${API_CONFIG.MUSIC_API}/api/albums/${id}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch album:', error);
      throw error;
    }
  },

  async getArtist(id: string): Promise<Artist> {
    try {
      const response = await apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/artists/${id}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch artist:', error);
      throw error;
    }
  },

  async getAlbumSongs(albumId: string): Promise<Song[]> {
    try {
      const response = await apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/albums/${albumId}/songs`);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.warn('Failed to fetch album songs:', error);
      return [];
    }
  },

  async searchContent(query: string): Promise<{
    songs: Song[];
    albums: Album[];
    artists: Artist[];
  }> {
    try {
      // First try the dedicated search endpoint
      const response = await apiRequest<{
        songs: Song[];
        albums: Album[];
        artists: Artist[];
      }>(`${API_CONFIG.MUSIC_API}/api/search?q=${encodeURIComponent(query)}`);
      return {
        songs: Array.isArray(response.songs) ? response.songs : [],
        albums: Array.isArray(response.albums) ? response.albums : [],
        artists: Array.isArray(response.artists) ? response.artists : [],
      };
    } catch (error) {
      console.warn('Dedicated search failed, falling back to manual search:', error);
      
      // Fallback: search through all data manually with improved fuzzy matching
      try {
        // Try individual search endpoints first
        const [songsSearchResult, albumsResult, artistsResult] = await Promise.allSettled([
          apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/songs/search?q=${encodeURIComponent(query)}`).catch(() => []),
          musicApi.getAlbums(),
          musicApi.getArtists()
        ]);

        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(' ').filter(word => word.length > 0);
        
        const songs = songsSearchResult.status === 'fulfilled' ? songsSearchResult.value : [];
        const albums = albumsResult.status === 'fulfilled' ? albumsResult.value : [];
        const artists = artistsResult.status === 'fulfilled' ? artistsResult.value : [];

        // Improved fuzzy matching function
        const fuzzyMatch = (text: string | undefined, searchTerms: string[]): boolean => {
          if (!text || typeof text !== 'string') return false;
          const textLower = text.toLowerCase();
          
          // Check if all search terms are found in the text
          return searchTerms.every(term => textLower.includes(term));
        };

        // Filter albums with improved matching
        const filteredAlbums = albums.filter(album => {
          try {
            return fuzzyMatch(album.title, queryWords) ||
                   fuzzyMatch(album.artist?.name, queryWords);
          } catch (e) {
            console.warn('Error filtering album:', album, e);
            return false;
          }
        });

        // Filter artists with improved matching
        const filteredArtists = artists.filter(artist => {
          try {
            return fuzzyMatch(artist.name, queryWords) ||
                   fuzzyMatch(artist.bio, queryWords);
          } catch (e) {
            console.warn('Error filtering artist:', artist, e);
            return false;
          }
        });

        return {
          songs: songs,
          albums: filteredAlbums,
          artists: filteredArtists
        };
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
        return { songs: [], albums: [], artists: [] };
      }
    }
  },
};

export const userApi = {
  // User profile methods
  getUserProfile: async (userId: string) => {
    try {
      const userData = await apiRequest<UserDto>(`${API_CONFIG.USER_API}/api/users/${userId}`);
      return {
        id: userData.identityUserId, // Use IdentityUserId for consistency with API calls
        identityUserId: userData.identityUserId,
        username: userData.userName,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        followers: userData.followers.length,
        following: userData.followedUsers.length,
        playlists: userData.playlists.length,
        isPrivate: userData.isPrivate
      };
    } catch (error) {
      throw error;
    }
  },

  getUserProfileByIdentityId: async (identityUserId: string) => {
    try {
      const userData = await apiRequest<UserDto>(`${API_CONFIG.USER_API}/api/users/identity/${identityUserId}`);
      return {
        id: userData.identityUserId, // Use IdentityUserId for consistency with API calls
        identityUserId: userData.identityUserId,
        username: userData.userName,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        followers: userData.followers.length,
        following: userData.followedUsers.length,
        playlists: userData.playlists.length,
        isPrivate: userData.isPrivate
      };
    } catch (error) {
      throw error;
    }
  },

  getAllUsers: () =>
    apiRequest<UserDto[]>(`${API_CONFIG.USER_API}/api/users`),

  updateUserProfile: (userId: string, data: Partial<User>) =>
    apiRequest<User>(`${API_CONFIG.USER_API}/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateUserProfileByIdentityId: (identityUserId: string, data: { username?: string; displayName?: string; bio?: string; avatarUrl?: string; isPrivate?: boolean }) =>
    apiRequest<void>(`${API_CONFIG.USER_API}/api/users/identity/${identityUserId}`, {
      method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Friend management
  sendFriendRequest: (requesterId: string, addresseeId: string) => {
    const requestBody = { userId: requesterId, targetUserId: addresseeId };
    return apiRequest<{ message: string; friendshipId: string }>(`${API_CONFIG.USER_API}/api/friends/request`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  },

  acceptFriendRequest: (friendshipId: string, addresseeId: string) => {
    console.log('API: acceptFriendRequest called with:', { friendshipId, addresseeId });
    return apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/${friendshipId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ userId: addresseeId }),
    });
  },

  declineFriendRequest: (friendshipId: string, addresseeId: string) => {
    console.log('API: declineFriendRequest called with:', { friendshipId, addresseeId });
    return apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/${friendshipId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ userId: addresseeId }),
    });
  },

  removeFriend: (friendshipId: string, userId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/${friendshipId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    }),

  blockUser: (friendshipId: string, blockerId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/${friendshipId}/block`, {
      method: 'POST',
      body: JSON.stringify({ blockerId }),
    }),

  getFriends: (userId: string) =>
    apiRequest<string[]>(`${API_CONFIG.USER_API}/api/friends/${userId}`),

  getPendingFriendRequests: (userId: string) =>
    apiRequest<FriendRequest[]>(`${API_CONFIG.USER_API}/api/friends/pending/${userId}`),

  getFriendshipStatus: (userId1: string, userId2: string) =>
    apiRequest<FriendshipStatus>(`${API_CONFIG.USER_API}/api/friends/status?userId1=${userId1}&userId2=${userId2}`),

  // Chat management
  createOrGetChat: (participantIds: string[], isGroup = false, name?: string) =>
    apiRequest<Chat>(`${API_CONFIG.USER_API}/api/chats/create-or-get`, {
    method: 'POST',
      body: JSON.stringify({ participantIds, isGroup, name }),
    }),

  getChat: (chatId: string) =>
    apiRequest<Chat>(`${API_CONFIG.USER_API}/api/chats/${chatId}`),

  getUserChats: (userId: string) =>
    apiRequest<Chat[]>(`${API_CONFIG.USER_API}/api/chats/user/${userId}`),

  getChatMessages: (chatId: string, page = 1, pageSize = 50) =>
    apiRequest<Message[]>(`${API_CONFIG.USER_API}/api/chats/${chatId}/messages?page=${page}&pageSize=${pageSize}`),

  sendMessage: (chatId: string, content: string, type = 'Text', replyToId?: string) =>
    apiRequest<Message>(`${API_CONFIG.USER_API}/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type, replyToId }),
    }),

  markMessageAsRead: (messageId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/chats/messages/${messageId}/read`, {
      method: 'POST',
    }),

  deleteChat: (chatId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/chats/${chatId}`, {
      method: 'DELETE',
    }),

  // Reset all friendships (for development/testing)
  resetAllFriendships: () =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/friends/reset`, {
      method: 'DELETE',
    }),

  // Sync users from Identity service to User service
  syncUsers: () =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/users/sync-users`, {
      method: 'POST',
    }),

  // Legacy follow functionality (keeping for compatibility)
  followUser: (followerId: string, followedId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/follows`, {
      method: 'POST',
      body: JSON.stringify({ followerId, followedId }),
    }),

  unfollowUser: (followerId: string, followedId: string) =>
    apiRequest<{ message: string }>(`${API_CONFIG.USER_API}/api/follows`, {
      method: 'DELETE',
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
  searchUsers: async (query: string): Promise<User[]> => {
    try {
      const userDtos = await apiRequest<UserDto[]>(`${API_CONFIG.USER_API}/api/users/search?q=${encodeURIComponent(query)}`);
      
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
      console.warn('User search failed:', error);
      return [];
    }
  },

  // Get current user profile with IdentityUserId
  getCurrentUserProfile: async (): Promise<User | null> => {
    try {
      const currentUser = identityApi.getCurrentUser();
      if (!currentUser) return null;
      
      // Get the full user profile which includes the MongoDB _id
      // Use the IdentityUserId to fetch the user profile
      const userData = await apiRequest<UserDto>(`${API_CONFIG.USER_API}/api/users/identity/${currentUser.id}`);
      return {
        id: userData.identityUserId, // Use IdentityUserId for consistency with API calls
        username: userData.userName,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        followers: userData.followers.length,
        following: userData.followedUsers.length,
        playlists: userData.playlists.length,
        isPrivate: userData.isPrivate
      };
    } catch (error) {
      console.error('Failed to get current user profile:', error);
      return null;
    }
  },
}; 

export interface FollowStats {
  userId: string;
  followerCount: number;
  followingCount: number;
}

export function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('name' in obj && typeof obj.name === 'string') return obj.name;
    if ('title' in obj && typeof obj.title === 'string') return obj.title;
  }
  return String(value);
}

export function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;
  return [];
}

export function processArtists(artists: unknown): string[] {
  if (!artists) return ['Unknown Artist'];
  if (Array.isArray(artists)) {
    return artists.map((artist: unknown) => {
      if (typeof artist === 'string') return artist;
      if (typeof artist === 'object' && artist !== null) {
        const obj = artist as Record<string, unknown>;
        if ('name' in obj && typeof obj.name === 'string') return obj.name;
      }
      return 'Unknown Artist';
    });
  }
  if (typeof artists === 'string') return [artists];
  if (typeof artists === 'object' && artists !== null) {
    const obj = artists as Record<string, unknown>;
    if ('name' in obj && typeof obj.name === 'string') return [obj.name];
  }
  return ['Unknown Artist'];
}
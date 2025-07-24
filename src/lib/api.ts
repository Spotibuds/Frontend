const isProduction = process.env.NODE_ENV === "production";

export const API_CONFIG = {
  IDENTITY_API: process.env.NEXT_PUBLIC_IDENTITY_API || (isProduction 
    ? "https://identity-spotibuds-dta5hhc7gka0gnd3.eastasia-01.azurewebsites.net"
    : "http://localhost:80"),
  MUSIC_API: process.env.NEXT_PUBLIC_MUSIC_API || (isProduction
    ? "https://music-spotibuds-ehckeeb8b5cfedfv.eastasia-01.azurewebsites.net"
    : "http://localhost:81"),
  USER_API: process.env.NEXT_PUBLIC_USER_API || (isProduction
    ? "https://user-spotibuds-h7abc7b2f4h4dqcg.eastasia-01.azurewebsites.net"
    : "http://localhost:5003"),
} as const;

// Helper function to convert Azure Blob URLs to proxied URLs
export const getProxiedImageUrl = (azureBlobUrl?: string): string | undefined => {
  if (!azureBlobUrl) return undefined;
  
  // If it's already a proxied URL, return as is
  if (azureBlobUrl.includes('/api/media/image')) return azureBlobUrl;
  
  // Convert Azure Blob URL to proxied URL
  const encodedUrl = encodeURIComponent(azureBlobUrl);
  return `${API_CONFIG.MUSIC_API}/api/media/image?url=${encodedUrl}`;
};

// Helper function to convert Azure Blob URLs to proxied audio URLs
export const getProxiedAudioUrl = (azureBlobUrl?: string): string | undefined => {
  if (!azureBlobUrl) return undefined;
  
  // If it's already a proxied URL, return as is
  if (azureBlobUrl.includes('/api/media/audio')) return azureBlobUrl;
  
  // Convert Azure Blob URL to proxied URL
  const encodedUrl = encodeURIComponent(azureBlobUrl);
  return `${API_CONFIG.MUSIC_API}/api/media/audio?url=${encodedUrl}`;
};

// Debug function
export const logApiConfig = () => {
  // Debug logging removed for cleaner code
};


// Type definitions for API responses
export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ArtistReference {
  id: string;
  name: string;
}

export interface AlbumReference {
  id: string;
  title: string;
}

export interface SongReference {
  id: string;
  position: number;
  addedAt: string;
}

export interface Song {
  id: string;
  title: string;
  artists: ArtistReference[];
  genre: string;
  durationSec: number;
  album?: AlbumReference;
  fileUrl: string;
  snippetUrl?: string;
  coverUrl: string;
  createdAt: string;
  releaseDate?: string;
}

export interface Artist {
  id: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  albums: AlbumReference[];
  createdAt: string;
}

export interface Album {
  id: string;
  title: string;
  songs: SongReference[];
  artist?: ArtistReference;
  coverUrl?: string;
  releaseDate?: string;
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songs: SongReference[];
  createdAt: string;
  updatedAt: string;
}

export interface FollowStats {
  userId: string;
  followerCount: number;
  followingCount: number;
}

// API Helper function
async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("authToken");
  
  const config: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);
  
  if (!response.ok) {
    let errorText;
    try {
      const errorJson = await response.json();
      errorText = errorJson.message || JSON.stringify(errorJson);
    } catch {
      errorText = await response.text();
    }
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

// Identity API
export const identityApi = {
  login: async (data: LoginRequest) => {
    const response = await apiRequest<AuthResponse>(
      `${API_CONFIG.IDENTITY_API}/api/auth/login`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    
    // Store token in localStorage
    localStorage.setItem("authToken", response.accessToken);
    localStorage.setItem("user", JSON.stringify(response.user));
    
    return response;
  },

  register: async (data: RegisterRequest) => {
    return apiRequest<{ message: string; userId: string }>(
      `${API_CONFIG.IDENTITY_API}/api/auth/register`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  logout: async () => {
    await apiRequest(`${API_CONFIG.IDENTITY_API}/api/auth/logout`, {
      method: "POST",
    });
    
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  },
};

// Music API
export const musicApi = {
  // Songs
  getSongs: () => apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/songs`),
  
  getSong: (id: string) => 
    apiRequest<Song>(`${API_CONFIG.MUSIC_API}/api/songs/${id}`),
  
  createSong: (data: {
    title: string;
    artists: ArtistReference[];
    genre: string;
    durationSec: number;
    album?: AlbumReference;
    fileUrl: string;
    snippetUrl?: string;
    coverUrl: string;
    releaseDate?: string;
  }) => apiRequest<Song>(`${API_CONFIG.MUSIC_API}/api/songs`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  uploadSongFile: (songId: string, file: File) => {
    const formData = new FormData();
    formData.append('audioFile', file);
    return apiRequest<{ fileUrl: string }>(`${API_CONFIG.MUSIC_API}/api/songs/${songId}/upload-file`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  uploadSongCover: (songId: string, file: File) => {
    const formData = new FormData();
    formData.append('imageFile', file);
    return apiRequest<{ coverUrl: string }>(`${API_CONFIG.MUSIC_API}/api/songs/${songId}/upload-cover`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  uploadSongSnippet: (songId: string, file: File) => {
    const formData = new FormData();
    formData.append('audioFile', file);
    return apiRequest<{ snippetUrl: string }>(`${API_CONFIG.MUSIC_API}/api/songs/${songId}/upload-snippet`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  // Artists
  getArtists: () => apiRequest<Artist[]>(`${API_CONFIG.MUSIC_API}/api/artists`),
  
  getArtist: (id: string) => 
    apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/artists/${id}`),

  createArtist: (data: {
    name: string;
    bio?: string;
  }) => apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/artists`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  uploadArtistImage: (artistId: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiRequest<{ imageUrl: string }>(`${API_CONFIG.MUSIC_API}/api/artists/${artistId}/image`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  // Albums
  getAlbums: () => apiRequest<Album[]>(`${API_CONFIG.MUSIC_API}/api/albums`),
  
  getAlbum: (id: string) => 
    apiRequest<Album>(`${API_CONFIG.MUSIC_API}/api/albums/${id}`),

  getAlbumSongs: (id: string) => 
    apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/albums/${id}/songs`),

  createAlbum: (data: {
    title: string;
    artist?: ArtistReference;
    releaseDate?: string;
  }) => apiRequest<Album>(`${API_CONFIG.MUSIC_API}/api/albums`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  uploadAlbumCover: (albumId: string, file: File) => {
    const formData = new FormData();
    formData.append('imageFile', file);
    return apiRequest<{ coverUrl: string }>(`${API_CONFIG.MUSIC_API}/api/albums/${albumId}/upload-cover`, {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  addSongToAlbum: (albumId: string, songId: string, position?: number) => {
    const query = position !== undefined ? `?position=${position}` : '';
    return apiRequest(`${API_CONFIG.MUSIC_API}/api/albums/${albumId}/songs/${songId}${query}`, {
      method: 'POST',
    });
  },

  // Playlists
  getPlaylists: () => apiRequest<Playlist[]>(`${API_CONFIG.MUSIC_API}/api/playlists`),
  
  getPlaylist: (id: string) => 
    apiRequest<Playlist>(`${API_CONFIG.MUSIC_API}/api/playlists/${id}`),
};

// User API
export const userApi = {
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
}; 
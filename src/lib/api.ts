const isProduction = process.env.NODE_ENV === "production";

export const API_CONFIG = {
  IDENTITY_API: process.env.NEXT_PUBLIC_IDENTITY_API || (isProduction 
    ? "https://identity-spotibuds-dta5hhc7gka0gnd3.eastasia-01.azurewebsites.net"
    : "http://localhost:5001"),
  MUSIC_API: process.env.NEXT_PUBLIC_MUSIC_API || (isProduction
    ? "https://music-spotibuds-ehckeeb8b5cfedfv.eastasia-01.azurewebsites.net"
    : "http://localhost:5002"),
  USER_API: process.env.NEXT_PUBLIC_USER_API || (isProduction
    ? "https://user-spotibuds-h7abc7b2f4h4dqcg.eastasia-01.azurewebsites.net"
    : "http://localhost:5003"),
} as const;

// Debug function
export const logApiConfig = () => {
  console.log('🔧 API Configuration Debug:', {
    IDENTITY_API: API_CONFIG.IDENTITY_API,
    MUSIC_API: API_CONFIG.MUSIC_API,
    USER_API: API_CONFIG.USER_API,
    isProduction,
  });

  if (!isProduction) {
      console.log('⚠️  Running in development mode with localhost APIs ');
    }
};


// Types
export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  isPrivate?: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  isPrivate: boolean;
  createdAt: string;
  roles: string[];
}

export interface Song {
  id: string;
  title: string;
  artistName: string;
  genre?: string;
  duration: number;
  fileUrl: string;
  coverUrl?: string;
  artistId: string;
  createdAt: string;
}

export interface Artist {
  id: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  createdAt: string;
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
    const response = await apiRequest<{ token: string; user: User }>(
      `${API_CONFIG.IDENTITY_API}/api/auth/login`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    
    // Store token in localStorage
    localStorage.setItem("authToken", response.token);
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
  getSongs: () => apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/songs`),
  
  getSong: (id: string) => 
    apiRequest<Song>(`${API_CONFIG.MUSIC_API}/api/songs/${id}`),
  
  searchSongs: (params: { title?: string; artist?: string; genre?: string }) => {
    const query = new URLSearchParams();
    if (params.title) query.append("title", params.title);
    if (params.artist) query.append("artist", params.artist);
    if (params.genre) query.append("genre", params.genre);
    
    return apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/songs/search?${query}`);
  },
  
  getArtists: () => apiRequest<Artist[]>(`${API_CONFIG.MUSIC_API}/api/artists`),
  
  getArtist: (id: string) => 
    apiRequest<Artist>(`${API_CONFIG.MUSIC_API}/api/artists/${id}`),
  
  getArtistSongs: (id: string) => 
    apiRequest<Song[]>(`${API_CONFIG.MUSIC_API}/api/artists/${id}/songs`),
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
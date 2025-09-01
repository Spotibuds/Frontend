import { Song, API_CONFIG } from './api';

// Use centralized API configuration instead of hardcoded URLs
const MUSIC_API_URL = API_CONFIG.MUSIC_API;
const USER_API_URL = API_CONFIG.USER_API;

export interface PlaylistSong extends Song {
  position: number;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  createdBy?: string;
  coverUrl?: string;
  songs: PlaylistSong[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaylistDto {
  name: string;
  description?: string;
}

export interface ListeningHistoryItem {
  songId: string;
  songTitle?: string;
  artist?: string;
  coverUrl?: string;
  playedAt: string;
  duration: number;
}

export class PlaylistService {
  static async getUserPlaylists(userId: string): Promise<Playlist[]> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/user/${userId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user playlists');
    }
    return response.json();
  }

  static async getPlaylist(playlistId: string): Promise<Playlist> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/${playlistId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch playlist');
    }
    return response.json();
  }

  static async createPlaylist(userId: string, dto: CreatePlaylistDto): Promise<Playlist> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/user/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      throw new Error('Failed to create playlist');
    }
    return response.json();
  }

  static async updatePlaylist(playlistId: string, dto: Partial<CreatePlaylistDto>): Promise<void> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/${playlistId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });
    if (!response.ok) {
      throw new Error('Failed to update playlist');
    }
  }

  static async deletePlaylist(playlistId: string): Promise<void> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/${playlistId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete playlist');
    }
  }

  static async addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/${playlistId}/songs/${songId}`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to add song to playlist');
    }
  }

  static async removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
    const response = await fetch(`${MUSIC_API_URL}/api/playlists/${playlistId}/songs/${songId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to remove song from playlist');
    }
  }

  static async addToListeningHistory(userId: string, songId: string, duration: number): Promise<void> {
    try {
      const response = await fetch(`${USER_API_URL}/api/users/${userId}/listening-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ songId, duration }),
      });
      // Don't throw on failure - listening history is not critical
      if (!response.ok) {
        console.warn('Failed to add to listening history');
      }
    } catch (error) {
      console.warn('Failed to add to listening history:', error);
    }
  }

  static async getListeningHistory(userId: string, limit = 50, skip = 0): Promise<ListeningHistoryItem[]> {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${USER_API_URL}/api/users/identity/${userId}/listening-history?limit=${limit}&skip=${skip}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to fetch listening history');
    }
    return response.json();
  }
}

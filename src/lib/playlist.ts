import { Song, API_CONFIG, apiRequest } from "./api";

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
  songCount?: number;
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
  static getUserPlaylists(userId: string): Promise<Playlist[]> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/user/${userId}`);
  }
  static getPlaylist(id: string): Promise<Playlist> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}`);
  }
  static createPlaylist(userId: string, dto: CreatePlaylistDto): Promise<Playlist> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/user/${userId}`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }
  static updatePlaylist(id: string, dto: Partial<CreatePlaylistDto>): Promise<void> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
  }
  static deletePlaylist(id: string): Promise<void> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}`, { method: "DELETE" });
  }
  static addSongToPlaylist(id: string, songId: string): Promise<void> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}/songs/${songId}`, { method: "POST" });
  }
  static removeSongFromPlaylist(id: string, songId: string): Promise<void> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}/songs/${songId}`, { method: "DELETE" });
  }
  static reorderSongs(id: string, songIds: string[]): Promise<void> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}/songs/reorder`, {
      method: "PUT",
      body: JSON.stringify({ songIds }),
    });
  }
  static addToListeningHistory(userId: string, songId: string, duration: number): Promise<void> {
    return apiRequest(`${USER_API_URL}/api/users/identity/${userId}/listening-history`, {
      method: "POST",
      body: JSON.stringify({ songId, duration }),
    });
  }
  static getListeningHistory(
    userId: string,
    limit = 50,
    skip = 0
  ): Promise<ListeningHistoryItem[]> {
    return apiRequest(
      `${USER_API_URL}/api/users/identity/${userId}/listening-history?limit=${limit}&skip=${skip}`
    );
  }
}

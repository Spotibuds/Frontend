import { Song, API_CONFIG, apiRequest } from "./api";
import { ApiError } from "./request";

export const PLAYLIST_EVENT = "spotibuds:playlist-changed";
function changed(id?: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(PLAYLIST_EVENT, { detail: { id } }));
}

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
  isPublic?: boolean;
  songs: PlaylistSong[];
  songCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaylistDto {
  name: string;
  description?: string;
  isPublic?: boolean;
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
    return apiRequest(`${MUSIC_API_URL}/api/playlists/user/${userId}?limit=100`);
  }
  static getPlaylist(id: string): Promise<Playlist> {
    return apiRequest(`${MUSIC_API_URL}/api/playlists/${id}`);
  }
  static async createPlaylist(userId: string, dto: CreatePlaylistDto): Promise<Playlist> {
    const playlist = await apiRequest<Playlist>(`${MUSIC_API_URL}/api/playlists/user/${userId}`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
    changed(playlist.id);
    return playlist;
  }
  static async updatePlaylist(id: string, dto: Partial<CreatePlaylistDto>): Promise<void> {
    await apiRequest(`${MUSIC_API_URL}/api/playlists/${id}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
    changed(id);
  }
  static async deletePlaylist(id: string): Promise<void> {
    await apiRequest(`${MUSIC_API_URL}/api/playlists/${id}`, { method: "DELETE" });
    changed(id);
  }
  static async addSongToPlaylist(id: string, songId: string): Promise<void> {
    await apiRequest(`${MUSIC_API_URL}/api/playlists/${id}/songs/${songId}`, { method: "POST" });
    changed(id);
  }
  static async removeSongFromPlaylist(id: string, songId: string): Promise<void> {
    await apiRequest(`${MUSIC_API_URL}/api/playlists/${id}/songs/${songId}`, { method: "DELETE" });
    changed(id);
  }
  static async addSongsToPlaylist(id: string, songs: Song[]): Promise<number> {
    const playlist = await this.getPlaylist(id);
    const existing = new Set(playlist.songs.map(song => song.id));
    let added = 0;
    for (const song of songs) {
      if (existing.has(song.id)) continue;
      try {
        await this.addSongToPlaylist(id, song.id);
        existing.add(song.id);
        added++;
      } catch (error) {
        // A concurrent duplicate is safe; other conflicts still require recovery.
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.message === "Song is already in the playlist."
        )
          continue;
        throw new Error(
          `${added} ${added === 1 ? "song was" : "songs were"} added. ${error instanceof Error ? error.message : "The remaining songs could not be added."} Retry to add the remaining songs.`
        );
      }
    }
    return added;
  }
  static async reorderSongs(id: string, songIds: string[]): Promise<void> {
    await apiRequest(`${MUSIC_API_URL}/api/playlists/${id}/songs/reorder`, {
      method: "PUT",
      body: JSON.stringify({ songIds }),
    });
    changed(id);
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

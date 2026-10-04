"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PlaylistService, PLAYLIST_EVENT } from "@/lib/playlist";
import { getSessionUser, getSessionGeneration, SESSION_EVENT } from "@/lib/session";
import { ApiError } from "@/lib/request";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

type Favorites = {
  ids: Set<string>;
  pending: Set<string>;
  loading: boolean;
  error: string | null;
  playlistId: string | null;
  toggle: (songId: string) => Promise<void>;
  reload: () => Promise<void>;
};
const Context = createContext<Favorites | null>(null);
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const playlist = useRef<string | null>(null);
  const owner = useRef<string | null>(null);
  const pendingRef = useRef(new Set<string>());
  const creating = useRef<Promise<string> | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const userId = getSessionUser()?.id || null;
    const generation = getSessionGeneration();
    const run = ++sequence.current;
    const valid = () => run === sequence.current && generation === getSessionGeneration();
    if (owner.current !== userId) {
      owner.current = userId;
      playlist.current = null;
      creating.current = null;
      pendingRef.current = new Set();
      setPending(new Set());
      setIds(new Set());
      setPlaylistId(null);
    }
    if (!userId) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const lists = await PlaylistService.getUserPlaylists(userId);
      if (!valid()) return;
      const liked = lists.find(item => item.name === "Liked Songs");
      const full = liked ? await PlaylistService.getPlaylist(liked.id) : null;
      if (!valid()) return;
      playlist.current = full?.id || null;
      setPlaylistId(full?.id || null);
      setIds(new Set(full?.songs.map(song => song.id) || []));
      setError(null);
    } catch (cause) {
      if (valid())
        setError(cause instanceof Error ? cause.message : "Favorites could not be loaded. Retry.");
    } finally {
      if (valid()) setLoading(false);
    }
  }, []);
  useDeferredEffect(() => {
    void reload();
    const invalidate = () => {
      sequence.current++;
    };
    return invalidate;
  }, [reload]);
  useEffect(() => {
    const session = () => {
      void reload();
    };
    const change = (event: Event) => {
      if (pendingRef.current.size) return;
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id || id === playlist.current || !playlist.current) void reload();
    };
    window.addEventListener(SESSION_EVENT, session);
    window.addEventListener(PLAYLIST_EVENT, change);
    return () => {
      window.removeEventListener(SESSION_EVENT, session);
      window.removeEventListener(PLAYLIST_EVENT, change);
    };
  }, [reload]);
  const toggle = useCallback(
    async (songId: string) => {
      const userId = getSessionUser()?.id;
      if (!userId || loading || pendingRef.current.has(songId)) return;
      const generation = getSessionGeneration();
      const valid = () => generation === getSessionGeneration() && owner.current === userId;
      pendingRef.current.add(songId);
      setPending(new Set(pendingRef.current));
      try {
        let id = playlist.current;
        if (!id) {
          creating.current ||= PlaylistService.createPlaylist(userId, {
            name: "Liked Songs",
            description: "Songs you want to come back to",
            isPublic: false,
          }).then(item => item.id);
          id = await creating.current;
          if (!valid()) return;
          playlist.current = id;
          setPlaylistId(id);
        }
        if (ids.has(songId)) await PlaylistService.removeSongFromPlaylist(id, songId);
        else {
          try {
            await PlaylistService.addSongToPlaylist(id, songId);
          } catch (cause) {
            if (
              !(
                cause instanceof ApiError &&
                cause.status === 409 &&
                cause.message === "Song is already in the playlist."
              )
            )
              throw cause;
          }
        }
        if (!valid()) return;
        setIds(previous => {
          const next = new Set(previous);
          if (ids.has(songId)) next.delete(songId);
          else next.add(songId);
          return next;
        });
        setError(null);
        await reload();
      } catch (cause) {
        if (valid())
          setError(cause instanceof Error ? cause.message : "Favorite could not be saved. Retry.");
        throw cause;
      } finally {
        if (valid()) {
          creating.current = null;
          pendingRef.current.delete(songId);
          setPending(new Set(pendingRef.current));
        }
      }
    },
    [ids, loading, reload]
  );
  return (
    <Context.Provider value={{ ids, pending, loading, error, playlistId, toggle, reload }}>
      {children}
    </Context.Provider>
  );
}
export function useFavorites() {
  const value = useContext(Context);
  if (!value) throw new Error("useFavorites must be used within FavoritesProvider");
  return value;
}

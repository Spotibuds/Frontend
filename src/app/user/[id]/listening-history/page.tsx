"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { userApi, musicApi, User } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useAudio } from "@/lib/audio";
interface HistoryItem {
  songId: string;
  songTitle: string;
  artist: string;
  duration?: number;
  playedAt: string;
}
export default function ListeningHistoryPage() {
  const params = useParams();
  const userId = String(params.id || "");
  const [profile, setProfile] = useState<User | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [month, setMonth] = useState("");
  const [replaying, setReplaying] = useState<string | null>(null);
  const [playError, setPlayError] = useState("");
  const { playSong } = useAudio();
  const replay = async (songId: string) => {
    if (replaying) return;
    setReplaying(songId);
    setPlayError("");
    try {
      const song = await musicApi.getSong(songId);
      if (!song?.fileUrl?.trim()) throw new Error("This song is no longer available to play.");
      playSong(song);
    } catch (cause) {
      setPlayError(
        cause instanceof Error ? cause.message : "The song could not be loaded. Please retry."
      );
    } finally {
      setReplaying(null);
    }
  };
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const load = useCallback(
    async (skip: number, first = false) => {
      if (inFlight.current && !inFlight.current.signal.aborted) return;
      setLoading(true);
      setError("");
      const controller = new AbortController();
      request.current = controller;
      inFlight.current = controller;
      try {
        if (first) {
          const nextProfile = await userApi.getUserProfileByIdentityId(userId);
          if (controller.signal.aborted) return;
          setProfile(nextProfile);
        }
        const page = await userApi.getListeningHistory(userId, 50, skip, controller.signal);
        if (controller.signal.aborted) return;
        setItems(previous => {
          const combined = first ? page : [...previous, ...page];
          return [
            ...new Map(combined.map(item => [`${item.songId}:${item.playedAt}`, item])).values(),
          ];
        });
        setOffset(skip + page.length);
        setHasMore(page.length === 50);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Listening history could not be loaded."
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [userId]
  );
  useDeferredEffect(() => {
    setItems([]);
    setProfile(null);
    setOffset(0);
    setHasMore(true);
    setMonth("");
    setPlayError("");
    void load(0, true);
    return () => request.current?.abort();
  }, [userId, load]);
  const visible = month ? items.filter(item => item.playedAt.startsWith(month)) : items;
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <Link
        href={`/user/${userId}`}
        className="inline-flex min-h-11 items-center text-sm text-purple-300 hover:underline"
      >
        Back to profile
      </Link>
      <header>
        <h1 className="text-3xl font-semibold">Listening history</h1>
        {profile && (
          <p className="mt-2 break-words text-gray-400">
            {profile.displayName || profile.username}
          </p>
        )}
      </header>
      <label className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
        Filter loaded entries by month
        <input
          type="month"
          className="min-h-11 max-w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
          value={month}
          onChange={event => setMonth(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-red-300">
          {error}{" "}
          <button className="underline" onClick={() => void load(offset, !profile)}>
            Retry
          </button>
        </p>
      )}
      {loading && <p role="status">Loading listening history…</p>}
      {playError && (
        <p role="alert" className="text-sm text-red-300">
          {playError}
        </p>
      )}
      <ol className="divide-y divide-gray-700">
        {visible.map(item => (
          <li
            key={`${item.songId}:${item.playedAt}`}
            className="py-3 flex flex-wrap justify-between gap-2"
          >
            <div>
              <strong>{item.songTitle || item.songId}</strong>
              <p className="text-gray-400">
                {typeof item.artist === "string" ? item.artist : "Unknown artist"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <time className="text-xs text-gray-400" dateTime={item.playedAt}>
                {new Date(item.playedAt).toLocaleString()}
              </time>
              <Button
                variant="outline"
                size="sm"
                disabled={replaying !== null}
                onClick={() => void replay(item.songId)}
                aria-label={`Play ${item.songTitle || "song"}`}
              >
                {replaying === item.songId ? "Loading…" : "Play"}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {!loading && !error && visible.length === 0 && (
        <p className="text-gray-400">
          {month
            ? hasMore
              ? "No loaded entries for this month. Load older entries to keep looking."
              : "No retained entries for this month."
            : "No listening history yet. Songs you play will appear here."}
        </p>
      )}
      {profile && hasMore && (
        <button
          className="min-h-11 rounded-lg bg-purple-700 px-5 py-2 disabled:opacity-50"
          disabled={loading}
          onClick={() => void load(offset)}
        >
          Load older entries
        </button>
      )}
      {profile && !hasMore && (
        <p className="text-gray-400" role="status">
          You’ve reached the oldest retained entry. History is retained for 90 days.
        </p>
      )}
    </main>
  );
}

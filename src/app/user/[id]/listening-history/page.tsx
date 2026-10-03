"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { userApi, User } from "@/lib/api";
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
    void load(0, true);
    return () => request.current?.abort();
  }, [userId, load]);
  const visible = month ? items.filter(item => item.playedAt.startsWith(month)) : items;
  return (
    <main className="p-4 sm:p-8 space-y-5">
      <Link href={`/user/${userId}`} className="text-purple-300">
        Back to profile
      </Link>
      <h1 className="text-3xl font-bold">
        {profile?.displayName || profile?.username || "User"} listening history
      </h1>
      <label className="flex gap-3 items-center">
        Filter loaded entries by month{" "}
        <input
          type="month"
          className="bg-gray-800 p-2 rounded"
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
            <time dateTime={item.playedAt}>{new Date(item.playedAt).toLocaleString()}</time>
          </li>
        ))}
      </ol>
      {!loading && !error && visible.length === 0 && (
        <p>No listening history for this selection.</p>
      )}
      {profile && hasMore && (
        <button
          className="bg-purple-700 px-5 py-2 rounded"
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

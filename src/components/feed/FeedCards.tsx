"use client";
import { createContext, useContext, useState, useEffect, useRef, useCallback, memo } from "react";
import Link from "next/link";
import MusicImage from "@/components/ui/MusicImage";
import { userApi, type Song, type Artist, type User } from "@/lib/api";
import { createPortal } from "react-dom";
import { useDialog } from "@/hooks/useDialog";
import { getSessionGeneration, getSessionUser } from "@/lib/session";
import type { FeedReactionState } from "@/hooks/useFeed";
import type { FeedReaction, FeedReactionSummary } from "@/lib/feedTypes";
import { useAudio } from "@/lib/audio";
import type { FeedSlide as Slide } from "@/lib/feedTypes";
import { feedSlideKey as keyOf } from "@/lib/feedState";
interface FeedCardState {
  me: User | null;
  artists: Artist[];
  reacting: Set<string>;
  reactionFlash: Record<string, { emoji: string; at: number; label: string }>;
  reactions: Record<string, FeedReactionState>;
  handleReact: (slide: Slide, emoji: string, index?: number) => Promise<void>;
}
export const FeedCardContext = createContext<FeedCardState | null>(null);
function useFeedCardContext() {
  const state = useContext(FeedCardContext);
  if (!state) throw new Error("Feed cards need their presentation state.");
  return state;
}

export const UserHeader = memo(
  ({
    slide,
    userMeta,
  }: {
    slide: Slide;
    userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
  }) => {
    const name =
      userMeta?.displayName || userMeta?.username || slide.displayName || slide.username || "User";
    return (
      <div className="flex min-w-0 items-center gap-3">
        <MusicImage
          src={userMeta?.avatarUrl}
          alt={name}
          type="circle"
          size="medium"
          className="w-10 h-10"
        />
        <Link
          href={`/user/${slide.identityUserId}`}
          className="min-w-0 break-words text-white font-medium hover:underline"
        >
          {name}
        </Link>
      </div>
    );
  }
);
UserHeader.displayName = "UserHeader";

export const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-3 sm:p-4 shadow-md w-full max-w-2xl mx-auto overflow-hidden">
    {children}
  </div>
);

export const ReactionBar = ({ slide, index }: { slide: Slide; index: number }) => {
  const { reacting, handleReact, reactionFlash, reactions } = useFeedCardContext();
  const slideKey = keyOf(slide);
  const flash = reactionFlash[slideKey];
  const reaction = reactions[slideKey];

  return (
    <div className="pointer-events-none fixed right-2 sm:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-1 sm:gap-2 items-center z-20">
      {["👍", "🔥", "❤️", "😂", "👏", "😮"].map(em => {
        const hasReacted = reaction?.summary?.myEmojis.includes(em) || false;
        return (
          <button
            key={em}
            onClick={e => {
              e.stopPropagation();
              handleReact(slide, em, index);
            }}
            className={`pointer-events-auto w-11 h-11 rounded-full text-sm sm:text-lg flex items-center justify-center motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-95 ${
              flash?.emoji === em ? "ring-2 ring-purple-400 motion-safe:animate-pulse" : ""
            } ${
              hasReacted
                ? "bg-purple-600/50 hover:bg-purple-600/70 text-white"
                : "bg-white/10 hover:bg-white/20 text-white/80"
            }`}
            title={`${hasReacted ? "Remove" : "Add"} ${em} reaction`}
            aria-label={`${hasReacted ? "Remove" : "Add"} ${em} reaction`}
            aria-pressed={hasReacted}
            disabled={reacting.has(slideKey) || !slide.postId || !reaction?.ready}
          >
            {em}
          </button>
        );
      })}
      {flash && (
        <div className="pointer-events-none mt-2 text-xs px-2 py-1 rounded bg-purple-600/80 text-white">
          {flash.label}
        </div>
      )}
    </div>
  );
};

const ReactionCluster = ({ slide }: { slide: Slide }) => {
  const { reactions, me } = useFeedCardContext();
  return <ReactionSummaryView summary={reactions[keyOf(slide)]?.summary} ownerId={me?.id} />;
};
export function PostReactions({ postId, ownerId }: { postId: string; ownerId: string }) {
  const [summary, setSummary] = useState<FeedReactionSummary>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const generation = getSessionGeneration();
    const abort = new AbortController();
    void userApi
      .getFeedReactionSummary(postId, abort.signal)
      .then(value => {
        if (active && generation === getSessionGeneration() && getSessionUser()?.id === ownerId)
          setSummary(value);
      })
      .catch(error => {
        if (active && generation === getSessionGeneration() && getSessionUser()?.id === ownerId)
          setError(
            error instanceof Error ? error.message : "Reactions could not be loaded. Retry."
          );
      })
      .finally(() => {
        if (active && generation === getSessionGeneration() && getSessionUser()?.id === ownerId)
          setLoading(false);
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [postId, ownerId, revision]);
  if (error)
    return (
      <div role="alert" className="text-red-300">
        {error}
        <button
          className="min-h-11 px-3 underline"
          onClick={() => {
            setLoading(true);
            setError("");
            setRevision(value => value + 1);
          }}
        >
          Reload reactions
        </button>
      </div>
    );
  if (loading)
    return (
      <p role="status" className="text-gray-300">
        Loading reactions…
      </p>
    );
  if (!summary) return null;
  if (!summary.total) return <p className="text-gray-300">No reactions yet</p>;
  return <ReactionSummaryView summary={summary} ownerId={ownerId} showTotal />;
}
export function ReactionSummaryView({
  summary,
  ownerId,
  showTotal = false,
}: {
  summary?: FeedReactionSummary;
  ownerId?: string;
  showTotal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<FeedReaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const dialog = useDialog(open && !!summary?.total, () => setOpen(false));
  if (open && !summary?.total) setOpen(false);
  const postId = summary?.postId;
  const loadPeople = useCallback(
    async (before: string | null) => {
      if (!postId || pending.current) return;
      pending.current = true;
      const operation = version.current;
      const owner = ownerId;
      const generation = getSessionGeneration();
      const abort = new AbortController();
      controller.current = abort;
      setLoading(true);
      setError("");
      try {
        const page = await userApi.getFeedReactionPeople(postId, before, abort.signal);
        if (
          operation !== version.current ||
          generation !== getSessionGeneration() ||
          getSessionUser()?.id !== owner
        )
          return;
        if (page.hasMore && (!page.nextCursor || page.nextCursor === before))
          throw new Error(
            "The next reaction page is unavailable. Close and reopen reactions to retry."
          );
        setPeople(previous => {
          const seen = new Set<string>();
          return [...(before ? previous : []), ...page.items].filter(item => {
            const key = `${item.fromIdentityUserId}:${item.emoji}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
        setCursor(page.nextCursor);
        setMore(page.hasMore);
      } catch (error) {
        if (operation === version.current && generation === getSessionGeneration())
          setError(
            error instanceof Error
              ? error.message
              : "People who reacted could not be loaded. Retry."
          );
      } finally {
        if (operation === version.current) {
          pending.current = false;
          setLoading(false);
        }
      }
    },
    [postId, ownerId]
  );
  const invalidatePeople = useCallback(() => {
    ++version.current;
    pending.current = false;
    controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!open || !summary?.total) return;
    let active = true;
    invalidatePeople();
    void Promise.resolve().then(() => {
      if (!active) return;
      setPeople([]);
      setCursor(null);
      setMore(false);
      void loadPeople(null);
    });
    return () => {
      active = false;
      invalidatePeople();
    };
  }, [open, loadPeople, summary?.total, invalidatePeople]);

  if (!summary?.total)
    return (
      <div
        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-30"
        aria-label="No reactions"
      >
        <span className="text-xs text-white/40">💬</span>
      </div>
    );
  const items = summary.counts
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return (
    <div>
      <button
        className="min-h-11 min-w-11 flex items-center justify-center -space-x-2 rounded-lg focus-visible:outline-2 focus-visible:outline-purple-300"
        onClick={() => setOpen(true)}
        aria-label="View reactions"
      >
        {showTotal && <span className="text-gray-300 mr-3">{summary.total} reactions</span>}
        {items.map(({ emoji, count }) => (
          <span
            key={emoji}
            className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-base"
          >
            {emoji}
            <span className="absolute -bottom-1 -right-1 text-[10px] bg-purple-600 text-white rounded px-1">
              {count}
            </span>
          </span>
        ))}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4"
            onClick={() => setOpen(false)}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-label="Reactions"
              tabIndex={-1}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-4 w-full max-w-md max-h-[85dvh] overflow-y-auto"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-white font-semibold">Reactions ({summary.total})</h2>
                <button
                  aria-label="Close reactions"
                  className="min-h-11 min-w-11 rounded-lg text-gray-300 hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
              {error && (
                <div role="alert" className="text-red-300">
                  {error}
                  <button
                    className="min-h-11 px-3 underline"
                    onClick={() => void loadPeople(cursor)}
                  >
                    Retry reactions
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {people.map(reaction => (
                  <div
                    key={`${reaction.fromIdentityUserId}:${reaction.emoji}`}
                    className="flex flex-wrap items-center justify-between gap-3 bg-white/5 rounded-lg p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-xl">{reaction.emoji}</span>
                      <Link
                        href={`/user/${reaction.fromIdentityUserId}`}
                        className="min-w-0 break-words text-purple-300 hover:underline"
                      >
                        {reaction.fromUserName || "User"}
                      </Link>
                    </div>
                    <time className="text-gray-300 text-xs" dateTime={reaction.createdAt}>
                      {new Date(reaction.createdAt).toLocaleString()}
                    </time>
                  </div>
                ))}
              </div>
              {loading && (
                <p role="status" className="text-gray-300 py-2">
                  Loading reactions…
                </p>
              )}
              {more && (
                <button
                  disabled={loading}
                  onClick={() => void loadPeople(cursor)}
                  className="min-h-11 px-4 py-2 mt-3 rounded-lg bg-purple-600 text-white disabled:opacity-50"
                >
                  Load more reactions
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export const RecentSongCard = memo(
  ({
    slide,
    song,
    userMeta,
  }: {
    slide: Extract<Slide, { type: "recent_song" }>;
    song: Song | null | undefined;
    userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
  }) => {
    const { playSong } = useAudio();
    const canPlay = Boolean(song?.fileUrl?.trim());

    return (
      <Card>
        <div className="relative">
          {/* Reaction cluster - always visible at top right */}
          <div className="absolute right-3 top-3 z-10">
            <ReactionCluster slide={slide} />
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <UserHeader slide={slide} userMeta={userMeta} />
              <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <button
                  className="w-28 h-28 rounded-xl overflow-hidden bg-white/5 flex-shrink-0"
                  onClick={() => song && canPlay && playSong(song)}
                  title="Play"
                  aria-label={`Play ${song?.title?.trim() || slide.songTitle?.trim() || "song"}`}
                  disabled={!canPlay}
                >
                  <MusicImage
                    src={song?.coverUrl || slide.coverUrl}
                    alt={slide.songTitle || "Song"}
                    size="large"
                    className="w-full h-full"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-white break-words font-semibold ${
                      slide.songTitle && slide.songTitle.length > 30
                        ? "text-lg sm:text-xl"
                        : slide.songTitle && slide.songTitle.length > 20
                          ? "text-xl sm:text-xl"
                          : "text-xl"
                    } ${slide.songTitle && slide.songTitle.length > 40 ? "leading-tight" : ""}`}
                  >
                    {slide.songTitle}
                  </div>
                  <div className="text-gray-300 text-sm sm:text-base truncate">
                    {song?.artists?.length
                      ? song.artists.map((a, i) => (
                          <Link
                            key={a.id || `${a.name}-${i}`}
                            href={a.id ? `/artist/${a.id}` : "#"}
                            className="hover:underline"
                          >
                            {a.name}
                            {i < (song?.artists?.length || 0) - 1 ? ", " : ""}
                          </Link>
                        ))
                      : slide.artist}
                  </div>
                  {song?.album?.id && (
                    <Link
                      href={`/album/${song.album.id}`}
                      className="text-purple-300 text-sm hover:underline"
                    >
                      View album
                    </Link>
                  )}
                  {!canPlay && (
                    <p className="text-gray-300 text-sm">
                      {song === undefined
                        ? "Loading playback…"
                        : "Playback unavailable. The post remains available."}
                    </p>
                  )}
                  {slide.playedAt && (
                    <div className="text-gray-400 text-xs mt-1">
                      {new Date(slide.playedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }
);
RecentSongCard.displayName = "RecentSongCard";

export const TopArtistsCard = memo(
  ({
    slide,
    userMeta,
  }: {
    slide: Extract<Slide, { type: "top_artists_week" }>;
    userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
  }) => {
    const { artists } = useFeedCardContext();
    return (
      <Card>
        <div className="relative">
          {/* Reaction cluster - always visible at top right */}
          <div className="absolute right-3 top-3 z-10">
            <ReactionCluster slide={slide} />
          </div>
          {/* Post label moved to bottom right */}
          <div className="absolute right-3 bottom-3 z-10">
            <div className="text-white/60 text-xs bg-black/20  px-2 py-1 rounded">
              Top artists this week
            </div>
          </div>
          <div className="flex items-center justify-between">
            <UserHeader slide={slide} userMeta={userMeta} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 pb-10">
            {slide.topArtists.slice(0, 5).map((a, i) => {
              const artistDetails = artists.find(
                ar => ar.name.toLowerCase() === a.name.toLowerCase()
              );
              return (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden">
                    <MusicImage
                      src={artistDetails?.imageUrl}
                      alt={a.name}
                      size="medium"
                      className="w-12 h-12"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    {artistDetails?.id ? (
                      <Link
                        href={`/artist/${artistDetails.id}`}
                        className="text-white font-semibold truncate hover:underline"
                      >
                        {a.name}
                      </Link>
                    ) : (
                      <div className="break-words text-white font-semibold">{a.name}</div>
                    )}
                    <div className="text-gray-300 text-xs">{a.count} plays</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  }
);
TopArtistsCard.displayName = "TopArtistsCard";

export const TopSongsCard = memo(
  ({
    slide,
    songsById,
    userMeta,
  }: {
    slide: Extract<Slide, { type: "top_songs_week" }>;
    songsById: Record<string, Song | null>;
    userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
  }) => {
    const { playSong } = useAudio();

    return (
      <Card>
        <div className="relative">
          {/* Reaction cluster - always visible at top right */}
          <div className="absolute right-3 top-3 z-10">
            <ReactionCluster slide={slide} />
          </div>
          {/* Post label moved to bottom right */}
          <div className="absolute right-3 bottom-3 z-10">
            <div className="text-white/60 text-xs bg-black/20  px-2 py-1 rounded">
              Top songs this week
            </div>
          </div>
          <div className="flex items-center justify-between">
            <UserHeader slide={slide} userMeta={userMeta} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 pb-10">
            {slide.topSongs.slice(0, 5).map((ts, i) => {
              const song = ts.songId ? songsById[ts.songId] : null;
              const canPlay = Boolean(song?.fileUrl?.trim());
              const title = song?.title?.trim() || ts.songTitle?.trim() || "Unknown Song";
              const artistName =
                song?.artists?.map(a => a.name).join(", ") || ts.artist || "Unknown Artist";
              return (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                  {song?.album?.id ? (
                    <Link
                      href={`/album/${song.album.id}`}
                      className="w-12 h-12 rounded-lg overflow-hidden"
                    >
                      <MusicImage
                        src={song?.coverUrl}
                        alt={title}
                        size="medium"
                        className="w-12 h-12"
                      />
                    </Link>
                  ) : (
                    <div className="w-12 h-12 rounded-lg overflow-hidden">
                      <MusicImage
                        src={song?.coverUrl}
                        alt={title}
                        size="medium"
                        className="w-12 h-12"
                      />
                    </div>
                  )}
                  <div className="text-left flex-1 min-w-0">
                    <div className="break-words text-white font-semibold">{title}</div>
                    <div className="text-gray-300 text-xs truncate">
                      {song?.artists?.length
                        ? song.artists.map((a, j: number) => (
                            <Link
                              key={a.id || `${a.name}-${j}`}
                              href={a.id ? `/artist/${a.id}` : "#"}
                              className="hover:underline"
                            >
                              {a.name}
                              {j < (song?.artists?.length || 0) - 1 ? ", " : ""}
                            </Link>
                          ))
                        : artistName}
                      <span className="text-gray-500"> • {ts.count} plays</span>
                    </div>
                    {!canPlay && (
                      <p className="text-gray-300 text-sm">
                        {song === undefined
                          ? "Loading playback…"
                          : "Playback unavailable. The post remains available."}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (song && canPlay) playSong(song);
                    }}
                    disabled={!canPlay}
                    aria-label={`Play ${title}`}
                    className="min-h-11 px-3 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                  >
                    Play
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  }
);
TopSongsCard.displayName = "TopSongsCard";

export const NowPlayingCard = memo(
  ({
    slide,
    song,
    userMeta,
  }: {
    slide: Extract<Slide, { type: "now_playing" }>;
    song: Song | null | undefined;
    userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
  }) => {
    const { playSong } = useAudio();
    const canPlay = Boolean(song?.fileUrl?.trim());

    return (
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <UserHeader slide={slide} userMeta={userMeta} />
              <span className="text-green-300 text-xs bg-green-500/10 border border-green-400/30 px-2 py-0.5 rounded">
                Now Playing
              </span>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <button
                className="w-28 h-28 rounded-xl overflow-hidden bg-emerald-900/30 ring-1 ring-emerald-600/30 flex-shrink-0"
                onClick={() => song && canPlay && playSong(song)}
                title="Play"
                aria-label={`Play ${song?.title?.trim() || slide.songTitle?.trim() || "song"}`}
                disabled={!canPlay}
              >
                <MusicImage
                  src={song?.coverUrl || slide.coverUrl}
                  alt={slide.songTitle || "Song"}
                  size="large"
                  className="w-full h-full"
                />
              </button>
              <div className="min-w-0">
                <div className="break-words text-white text-xl font-semibold">
                  {slide.songTitle || "Listening now"}
                </div>
                <div className="text-gray-200 truncate">
                  {song?.artists?.length
                    ? song!.artists.map((a, i: number) => (
                        <Link
                          key={a.id || `${a.name}-${i}`}
                          href={a.id ? `/artist/${a.id}` : "#"}
                          className="hover:underline"
                        >
                          {a.name}
                          {i < (song?.artists?.length || 0) - 1 ? ", " : ""}
                        </Link>
                      ))
                    : slide.artist}
                </div>
                {song?.album?.id && (
                  <Link
                    href={`/album/${song.album.id}`}
                    className="text-emerald-300 text-sm hover:underline"
                  >
                    View album
                  </Link>
                )}
                {!canPlay && (
                  <p className="text-gray-300 text-sm">
                    {song === undefined
                      ? "Loading playback…"
                      : "Playback unavailable. The post remains available."}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <ReactionCluster slide={slide} />
            </div>
          </div>
        </div>
      </Card>
    );
  }
);
NowPlayingCard.displayName = "NowPlayingCard";

export const CommonArtistsCard = memo(
  ({
    slide,
    userMeta,
  }: {
    slide: Extract<Slide, { type: "common_artists" }>;
    userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
  }) => {
    const { artists } = useFeedCardContext();
    return (
      <Card>
        <div className="relative">
          {/* Reaction cluster - always visible at top right */}
          <div className="absolute right-3 top-3 z-10">
            <ReactionCluster slide={slide} />
          </div>
          {/* Post label moved to bottom right */}
          <div className="absolute right-3 bottom-3 z-10">
            <div className="text-white/60 text-xs bg-black/20  px-2 py-1 rounded">
              Artists in common
            </div>
          </div>
          <div className="flex items-center justify-between">
            <UserHeader slide={slide} userMeta={userMeta} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 pb-10">
            {slide.commonArtists.slice(0, 5).map((artist, i) => {
              const artistDetails = artists.find(
                ar => ar.name.toLowerCase() === artist.toLowerCase()
              );
              return (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden">
                    <MusicImage
                      src={artistDetails?.imageUrl}
                      alt={artist}
                      size="medium"
                      className="w-12 h-12"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    {artistDetails?.id ? (
                      <Link
                        href={`/artist/${artistDetails.id}`}
                        className="text-white font-semibold truncate hover:underline"
                      >
                        {artist}
                      </Link>
                    ) : (
                      <div className="break-words text-white font-semibold">{artist}</div>
                    )}
                    <div className="text-gray-300 text-xs">Shared artist</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  }
);
CommonArtistsCard.displayName = "CommonArtistsCard";

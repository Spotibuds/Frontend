"use client";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFeed } from "@/hooks/useFeed";
import type { FeedSlide } from "@/lib/feedTypes";
import { feedSlideKey } from "@/lib/feedState";
import {
  FeedCardContext,
  RecentSongCard,
  NowPlayingCard,
  TopSongsCard,
  TopArtistsCard,
  CommonArtistsCard,
  ReactionBar,
} from "@/components/feed/FeedCards";

function FeedInner() {
  const searchParams = useSearchParams();
  const feed = useFeed();
  const {
    me,
    slides,
    songs: songsById,
    profiles: userMetaById,
    artists,
    reactions,
    reacting,
    reactionFlash,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    load: loadSlides,
  } = feed;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionsRef = useRef<Array<HTMLElement | null>>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visiblePost, setVisiblePost] = useState<string | null>(null);
  const slidesRef = useRef(slides);
  const currentRef = useRef(currentIndex);
  useLayoutEffect(() => {
    slidesRef.current = slides;
    currentRef.current = currentIndex;
  }, [slides, currentIndex]);
  const scrollToIndex = useCallback((index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const sections = root.querySelectorAll<HTMLElement>("[data-feed-navigation-section]");
    const target = sections?.[index];
    if (!target) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({
      top:
        root.scrollTop +
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        root.clientTop,
      behavior: reduced ? "auto" : "smooth",
    });
  }, []);
  const navigate = useCallback(
    async (step: number) => {
      const next = Math.max(0, currentRef.current + step);
      if (next >= slidesRef.current.length && hasMore && !error) await loadSlides(false);
      scrollToIndex(next);
    },
    [hasMore, error, loadSlides, scrollToIndex]
  );

  const deepTarget = searchParams?.get("postId") || "";
  const focusType = searchParams?.get("focusType") || "";
  const focusTo = searchParams?.get("to") || "";
  const focusSong = searchParams?.get("songId") || "";
  const deepRun = useRef(0);
  useEffect(() => {
    if (!deepTarget && !(focusType && focusTo)) return;
    const run = ++deepRun.current;
    let cancelled = false;
    const match = (slide: FeedSlide) =>
      deepTarget
        ? slide.postId === deepTarget
        : slide.type === focusType &&
          slide.identityUserId === focusTo &&
          (!(focusType === "recent_song" && focusSong) ||
            (slide.type === "recent_song" && slide.songId === focusSong));
    void (async () => {
      for (let attempt = 0; attempt <= 3 && !cancelled && deepRun.current === run; attempt++) {
        const index = slidesRef.current.findIndex(match);
        if (index >= 0) {
          requestAnimationFrame(() => {
            if (!cancelled) scrollToIndex(index);
          });
          return;
        }
        if (!attempt && isLoading) return;
        if (!hasMore || error || attempt === 3) return;
        await loadSlides(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    deepTarget,
    focusType,
    focusTo,
    focusSong,
    isLoading,
    me?.id,
    loadSlides,
    scrollToIndex,
    hasMore,
    error,
  ]);

  useEffect(() => {
    const root = containerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore || feed.scanPaused || error || isLoadingMore || isLoading)
      return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadSlides(false);
      },
      { root, rootMargin: "800px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, feed.scanPaused, error, isLoadingMore, isLoading, slides.length, loadSlides]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("[data-feed-navigation-section]")
    );
    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries)
          ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        const visible = sections
          .map((section, index) => ({ section, index, ratio: ratios.get(section) || 0 }))
          .sort((a, b) => b.ratio - a.ratio)[0];
        if (!visible || visible.ratio <= 0) return;
        setCurrentIndex(visible.index);
        setVisiblePost(visible.section.dataset.feedPostId || null);
      },
      { root, threshold: [0, 0.4, 0.6, 0.8] }
    );
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [slides, hasMore, isLoadingMore, error]);
  const markSeen = feed.markSeen;
  useEffect(() => {
    const slide = slides.find(item => item.postId === visiblePost);
    if (slide) markSeen(slide);
  }, [visiblePost, slides, markSeen]);
  if (!me) {
    return (
      <>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-gray-300">Please log in to see your feed.</div>
        </div>
      </>
    );
  }

  return (
    <FeedCardContext.Provider
      value={{ me, artists, reacting, reactionFlash, reactions, handleReact: feed.react }}
    >
      <div className="relative flex min-h-0 h-[calc(100dvh-11rem-1px)] flex-col">
        <div className="mx-auto w-full max-w-2xl shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-semibold text-white">Feed</h1>
          <button
            onClick={() => {
              void loadSlides(true);
              setCurrentIndex(0);
            }}
            disabled={isLoading || isLoadingMore}
            className="min-h-11 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Refresh feed
          </button>
        </div>
        {feed.enrichmentError && (
          <div role="alert" className="mx-auto max-w-2xl shrink-0 px-4 py-2 text-amber-200">
            {feed.enrichmentError}
            <button onClick={() => void feed.retryDetails()} className="min-h-11 px-3 underline">
              Retry unavailable details
            </button>
          </div>
        )}
        {reactions[slides[currentIndex]?.postId || ""]?.error && (
          <div role="alert" className="mx-auto max-w-2xl shrink-0 px-4 py-2 text-red-300">
            {reactions[slides[currentIndex].postId!].error}
            <button
              onClick={() => void feed.retryReaction(slides[currentIndex], true)}
              className="min-h-11 px-3 underline"
            >
              Reload reactions
            </button>
          </div>
        )}
        {isLoading && slides.length > 0 && (
          <p role="status" className="shrink-0 text-center text-gray-300">
            Refreshing feed…
          </p>
        )}
        {error && slides.length > 0 && (
          <div role="alert" className="mx-auto max-w-2xl shrink-0 px-4 py-2 text-red-300">
            {error}
            <button onClick={() => void feed.retryLoad()} className="min-h-11 px-3 underline">
              Retry loading feed
            </button>
          </div>
        )}
        {isLoading && !slides.length ? (
          <div
            role="status"
            aria-label="Loading feed"
            className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 space-y-4 w-full max-w-2xl mx-auto"
          >
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 animate-pulse"
              >
                <div className="h-4 bg-gray-800 rounded w-1/3"></div>
                <div className="mt-4 h-28 bg-gray-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : error && slides.length === 0 ? (
          <div
            role="alert"
            className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 text-center text-red-300"
          >
            {error}
            <div className="mt-3">
              <button
                onClick={() => loadSlides(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Retry
              </button>
            </div>
          </div>
        ) : slides.length === 0 && !hasMore ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 text-center text-gray-300">
            No public listening activity yet. Public music posts will appear here when people
            listen.
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              tabIndex={0}
              aria-label="Feed posts. Use Up and Down arrows to move between posts."
              onKeyDown={event => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  void navigate(event.key === "ArrowDown" ? 1 : -1);
                }
              }}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain snap-y snap-proximity"
            >
              {slides.map((slide, idx) => (
                <section
                  key={feedSlideKey(slide)}
                  data-feed-post-id={slide.postId}
                  data-feed-type={slide.type}
                  data-feed-navigation-section
                  ref={el => {
                    sectionsRef.current[idx] = el;
                  }}
                  className="relative snap-start min-h-full flex items-center justify-center px-4 pr-16 sm:pr-24 w-full"
                >
                  {slide.type === "recent_song" && (
                    <RecentSongCard
                      slide={slide}
                      song={songsById[slide.songId]}
                      userMeta={userMetaById[slide.identityUserId]}
                    />
                  )}
                  {slide.type === "now_playing" && (
                    <NowPlayingCard
                      slide={slide}
                      song={songsById[slide.songId]}
                      userMeta={userMetaById[slide.identityUserId]}
                    />
                  )}
                  {slide.type === "top_artists_week" && (
                    <TopArtistsCard slide={slide} userMeta={userMetaById[slide.identityUserId]} />
                  )}
                  {slide.type === "top_songs_week" && (
                    <TopSongsCard
                      slide={slide}
                      songsById={songsById}
                      userMeta={userMetaById[slide.identityUserId]}
                    />
                  )}
                  {slide.type === "common_artists" && (
                    <CommonArtistsCard
                      slide={slide}
                      userMeta={userMetaById[slide.identityUserId]}
                    />
                  )}

                  {/* Right-side reactions shown only for the active slide to avoid duplicates */}
                  {idx === currentIndex && <ReactionBar slide={slide} index={idx} />}
                </section>
              ))}

              {/* Loading card in its own snap section */}
              {isLoadingMore && (
                <section
                  data-feed-navigation-section
                  className="snap-start min-h-full flex items-center justify-center px-4 pr-16 sm:pr-24"
                >
                  <div
                    role="status"
                    aria-label="Loading more posts"
                    className="bg-gray-900/60 border border-gray-800 rounded-2xl p-3 sm:p-4 animate-pulse w-full max-w-2xl"
                  >
                    <div className="h-4 bg-gray-800 rounded w-1/3"></div>
                    <div className="mt-4 h-28 bg-gray-800 rounded"></div>
                  </div>
                </section>
              )}

              {/* End-of-feed section */}
              {!hasMore && (
                <section
                  data-feed-navigation-section
                  className="snap-start min-h-full flex items-center justify-center px-4 pr-16 sm:pr-24"
                >
                  <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 sm:p-6 text-center text-gray-300 w-full max-w-2xl">
                    You&apos;re all caught up. No more posts for now.
                  </div>
                </section>
              )}

              {/* Sentinel at the bottom for preloading more */}
              {hasMore && (
                <section
                  data-feed-navigation-section
                  className="snap-start min-h-full flex items-center justify-center px-4 pr-16 sm:pr-24"
                >
                  <div className="text-center text-gray-300">
                    <div ref={sentinelRef} className="h-1 w-full" />
                    <button
                      disabled={isLoadingMore || !!error}
                      onClick={() => void loadSlides(false)}
                      className="min-h-11 rounded-lg bg-white/10 px-4 py-2 disabled:opacity-50"
                    >
                      Load more posts
                    </button>
                  </div>
                </section>
              )}
            </div>

            {/* Prev/Next controls - Hidden on mobile */}
            <div className="pointer-events-none absolute inset-y-0 left-4 flex flex-col justify-center gap-3 hidden md:flex">
              <button
                className="pointer-events-auto px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-40"
                disabled={currentIndex <= 0}
                onClick={() => void navigate(-1)}
                aria-label="Previous post"
              >
                ▲
              </button>
              <button
                className="pointer-events-auto px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-40"
                disabled={currentIndex >= slides.length && !hasMore}
                onClick={() => void navigate(1)}
                aria-label="Next post"
              >
                ▼
              </button>
            </div>
          </>
        )}
      </div>
    </FeedCardContext.Provider>
  );
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="px-4 pt-8 max-w-2xl mx-auto">
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-300">
              Loading feed...
            </div>
          </div>
        </>
      }
    >
      <FeedInner />
    </Suspense>
  );
}

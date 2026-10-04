"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { identityApi, musicApi, userApi, type Artist, type Song, type User } from "@/lib/api";
import { getSessionGeneration, getSessionUser, SESSION_EVENT } from "@/lib/session";
import { chunkedShuffle, declumpAuthors, feedSlideKey, isFeedSlide } from "@/lib/feedState";
import type { FeedReactionSummary, FeedSlide } from "@/lib/feedTypes";

export interface FeedReactionState {
  summary?: FeedReactionSummary;
  loading: boolean;
  ready: boolean;
  error: string;
}
interface FeedState {
  slides: FeedSlide[];
  songs: Record<string, Song | null>;
  profiles: Record<string, { username?: string; displayName?: string; avatarUrl?: string }>;
  artists: Artist[];
  reactions: Record<string, FeedReactionState>;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string;
  enrichmentError: string;
  hasMore: boolean;
  scanPaused: boolean;
  reacting: Set<string>;
  reactionFlash: Record<string, { emoji: string; at: number; label: string }>;
}
interface Scope {
  id: string;
  generation: number;
  epoch: number;
}
const emptyState = (): FeedState => ({
  slides: [],
  songs: {},
  profiles: {},
  artists: [],
  reactions: {},
  isLoading: false,
  isLoadingMore: false,
  error: "",
  enrichmentError: "",
  hasMore: true,
  scanPaused: false,
  reacting: new Set(),
  reactionFlash: {},
});
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const seenKey = (id: string) => `feed_seen_v2:${id}`;
export function readFeedSeen(id: string) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(seenKey(id)) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, at]) =>
          typeof at === "number" &&
          Number.isFinite(at) &&
          at <= now &&
          now - at < 72 * 60 * 60 * 1000
      )
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

export function useFeed() {
  const [owner, setOwner] = useState(() => ({
    me: identityApi.getCurrentUser(),
    generation: getSessionGeneration(),
  }));
  const [state, setState] = useState<FeedState>(() => ({ ...emptyState(), isLoading: true }));
  const ownerId = owner.me?.id;
  const stateRef = useRef(state);
  const scope = useRef<Scope | null>(null);
  const epoch = useRef(0);
  const seed = useRef("");
  const cursor = useRef<string | null>(null);
  const keys = useRef(new Set<string>());
  const seen = useRef<Record<string, number>>({});
  const lastAuthor = useRef<string | null>(null);
  const failedReset = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const flight = useRef<{ promise: Promise<void>; controller: AbortController } | null>(null);
  const reactionVersions = useRef(new Map<string, number>());
  const busy = useRef(new Set<string>());
  const flashTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const metadataPending = useRef(new Set<string>());
  const detailsPending = useRef(false);

  const update = useCallback((change: (previous: FeedState) => FeedState) => {
    stateRef.current = change(stateRef.current);
    setState(stateRef.current);
  }, []);
  const owns = useCallback(
    (expected: Scope) =>
      scope.current?.epoch === expected.epoch &&
      scope.current.id === expected.id &&
      getSessionGeneration() === expected.generation &&
      getSessionUser()?.id === expected.id,
    []
  );
  const capture = useCallback(() => (scope.current ? { ...scope.current } : null), []);
  const cancel = useCallback(() => {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    flight.current = null;
    for (const timer of flashTimers.current.values()) clearTimeout(timer);
    flashTimers.current.clear();
    metadataPending.current.clear();
    detailsPending.current = false;
  }, []);
  const clearOwner = useCallback(() => {
    scope.current = null;
    ++epoch.current;
    cancel();
  }, [cancel]);

  const aliasesFor = useCallback((postId: string, key: string) => {
    const aliases = new Set([key]);
    for (const slide of stateRef.current.slides) {
      const alias = feedSlideKey(slide);
      if (slide.postId === postId || stateRef.current.reactions[alias]?.summary?.postId === postId)
        aliases.add(alias);
    }
    return aliases;
  }, []);
  const visualBusy = useCallback(() => {
    const aliases = new Set(busy.current);
    for (const slide of stateRef.current.slides) {
      const key = feedSlideKey(slide);
      if (
        busy.current.has(key) ||
        busy.current.has(stateRef.current.reactions[key]?.summary?.postId || "")
      )
        aliases.add(key);
    }
    return aliases;
  }, []);
  const loadReaction = useCallback(
    async (slide: FeedSlide, force = false) => {
      const expected = capture();
      if (!expected || !owns(expected) || !slide.postId) return;
      const key = feedSlideKey(slide);
      const previous = stateRef.current.reactions[key];
      const postId = previous?.summary?.postId || slide.postId;
      if (
        busy.current.has(key) ||
        busy.current.has(postId) ||
        (!force && (previous?.ready || previous?.loading))
      )
        return;
      const aliases = aliasesFor(postId, key);
      for (const alias of aliases)
        reactionVersions.current.set(alias, (reactionVersions.current.get(alias) || 0) + 1);
      const version = reactionVersions.current.get(key);
      const controller = new AbortController();
      controllers.current.add(controller);
      update(current => {
        const reactions = { ...current.reactions };
        for (const alias of aliases)
          reactions[alias] = { ...reactions[alias], loading: true, ready: false, error: "" };
        return { ...current, reactions };
      });
      try {
        const summary = await userApi.getFeedReactionSummary(postId, controller.signal);
        if (!owns(expected) || reactionVersions.current.get(key) !== version) return;
        const currentAliases = new Set([
          ...aliasesFor(postId, key),
          ...aliasesFor(summary.postId, key),
        ]);
        for (const alias of currentAliases)
          if (alias !== key)
            reactionVersions.current.set(alias, (reactionVersions.current.get(alias) || 0) + 1);
        update(current => {
          const reactions = { ...current.reactions };
          for (const alias of currentAliases)
            reactions[alias] = {
              summary,
              ready: !busy.current.has(summary.postId),
              loading: false,
              error: "",
            };
          return { ...current, reactions };
        });
      } catch (error) {
        if (!owns(expected) || reactionVersions.current.get(key) !== version) return;
        update(current => {
          const reactions = { ...current.reactions };
          for (const alias of aliases)
            reactions[alias] = {
              ...reactions[alias],
              ready: false,
              loading: false,
              error: message(
                error,
                "Reactions could not be loaded. Retry to check their current state."
              ),
            };
          return { ...current, reactions };
        });
      } finally {
        controllers.current.delete(controller);
      }
    },
    [capture, owns, aliasesFor, update]
  );

  const enrich = useCallback(
    async (slides: FeedSlide[], expected: Scope) => {
      if (!owns(expected)) return;
      const songIds = [
        ...new Set(
          slides.flatMap(slide =>
            slide.type === "recent_song" || slide.type === "now_playing"
              ? [slide.songId]
              : slide.type === "top_songs_week"
                ? slide.topSongs.flatMap(song => (song.songId ? [song.songId] : []))
                : []
          )
        ),
      ].filter(
        id =>
          !(id in stateRef.current.songs) &&
          !metadataPending.current.has(`${expected.epoch}:song:${id}`)
      );
      const profileIds = [...new Set(slides.map(slide => slide.identityUserId))].filter(
        id =>
          !stateRef.current.profiles[id] &&
          !metadataPending.current.has(`${expected.epoch}:profile:${id}`)
      );
      const results = await Promise.allSettled([
        ...songIds.map(async id => {
          const pendingKey = `${expected.epoch}:song:${id}`;
          metadataPending.current.add(pendingKey);
          try {
            const song = await musicApi.getSong(id);
            if (owns(expected))
              update(current => ({ ...current, songs: { ...current.songs, [id]: song } }));
          } catch (error) {
            if (owns(expected))
              update(current => ({
                ...current,
                songs: { ...current.songs, [id]: null },
                enrichmentError: message(
                  error,
                  "Track details could not be loaded. Retry unavailable details."
                ),
              }));
          } finally {
            metadataPending.current.delete(pendingKey);
          }
        }),
        ...profileIds.map(async id => {
          const pendingKey = `${expected.epoch}:profile:${id}`;
          metadataPending.current.add(pendingKey);
          try {
            const profile = await userApi.getUserProfileByIdentityId(id);
            if (owns(expected))
              update(current => ({
                ...current,
                profiles: {
                  ...current.profiles,
                  [id]: {
                    username: profile.username,
                    displayName: profile.displayName,
                    avatarUrl: profile.avatarUrl,
                  },
                },
              }));
          } catch (error) {
            if (owns(expected))
              update(current => ({
                ...current,
                enrichmentError: message(
                  error,
                  "Some profile details could not be loaded. The post snapshot remains available."
                ),
              }));
          } finally {
            metadataPending.current.delete(pendingKey);
          }
        }),
        ...slides.map(slide => loadReaction(slide)),
      ]);
      return results;
    },
    [owns, update, loadReaction]
  );

  const load = useCallback(
    (reset = false): Promise<void> => {
      if (!reset && flight.current) return flight.current.promise;
      const initial = capture();
      if (!initial || !owns(initial) || (!reset && !stateRef.current.hasMore))
        return Promise.resolve();
      if (reset) {
        cancel();
        scope.current = { ...initial, epoch: ++epoch.current };
        reactionVersions.current.clear();
        busy.current.clear();
        seen.current = readFeedSeen(initial.id);
      }
      const expected = capture()!;
      const controller = new AbortController();
      controllers.current.add(controller);
      failedReset.current = reset;
      update(current => ({
        ...current,
        isLoading: reset,
        isLoadingMore: !reset,
        error: "",
        scanPaused: false,
        reacting: reset ? new Set() : current.reacting,
      }));
      const request = { controller, promise: Promise.resolve() };
      flight.current = request;
      request.promise = (async () => {
        try {
          // A bounded scan can advance through authors with no eligible posts.
          // Never turn an empty but continuing page into a false end-of-feed.
          let requestCursor = reset ? null : cursor.current;
          let accepted = reset ? [] : stateRef.current.slides;
          const requestKeys = reset ? new Set<string>() : new Set(keys.current);
          let requestLastAuthor = reset ? null : lastAuthor.current;
          let hasMore = true;
          let found = false;
          for (let scan = 0; scan < 3 && hasMore; scan++) {
            const page = await userApi.getFeedPage(
              expected.id,
              10,
              requestCursor,
              controller.signal
            );
            if (!owns(expected)) return;
            if (
              !page ||
              !Array.isArray(page.items) ||
              !page.items.every(isFeedSlide) ||
              typeof page.hasMore !== "boolean" ||
              (page.hasMore &&
                (typeof page.nextCursor !== "string" ||
                  !page.nextCursor ||
                  page.nextCursor === requestCursor))
            )
              throw new Error("The feed continuation is unavailable. Refresh the feed to retry.");
            const unique = page.items.filter(slide => {
              const key = feedSlideKey(slide);
              if (requestKeys.has(key)) return false;
              requestKeys.add(key);
              return true;
            });
            const unseen = unique.filter(slide => !(feedSlideKey(slide) in seen.current));
            const priorSeen = unique.filter(slide => feedSlideKey(slide) in seen.current);
            const ordered = declumpAuthors(
              [
                ...chunkedShuffle(unseen, `${seed.current}:${requestCursor || "start"}`, 4),
                ...priorSeen,
              ],
              requestLastAuthor
            );
            if (ordered.length) requestLastAuthor = ordered.at(-1)!.identityUserId;
            accepted = [...accepted, ...ordered];
            keys.current = new Set(requestKeys);
            lastAuthor.current = requestLastAuthor;
            cursor.current = page.nextCursor;
            requestCursor = page.nextCursor;
            hasMore = page.hasMore;
            if (reset && scan === 0)
              update(current => ({
                ...current,
                reactions: {},
                songs: {},
                profiles: {},
                reactionFlash: {},
              }));
            update(current => ({ ...current, slides: accepted, hasMore }));
            void enrich(ordered, expected);
            if (ordered.length) {
              found = true;
              break;
            }
          }
          if (owns(expected)) update(current => ({ ...current, scanPaused: !found && hasMore }));
        } catch (error) {
          if (owns(expected))
            update(current => ({
              ...current,
              error: message(
                error,
                "The feed could not be loaded. Retry when the service is available."
              ),
            }));
        } finally {
          controllers.current.delete(controller);
          if (flight.current === request) {
            flight.current = null;
            if (owns(expected))
              update(current => ({ ...current, isLoading: false, isLoadingMore: false }));
          }
        }
      })();
      return request.promise;
    },
    [capture, owns, cancel, update, enrich]
  );

  useEffect(() => {
    const sync = () =>
      setOwner({ me: identityApi.getCurrentUser(), generation: getSessionGeneration() });
    window.addEventListener(SESSION_EVENT, sync);
    return () => window.removeEventListener(SESSION_EVENT, sync);
  }, []);
  useEffect(() => {
    cancel();
    scope.current = ownerId
      ? { id: ownerId, generation: owner.generation, epoch: ++epoch.current }
      : null;
    seed.current = crypto.randomUUID();
    cursor.current = null;
    keys.current = new Set();
    busy.current.clear();
    reactionVersions.current.clear();
    update(() => emptyState());
    if (ownerId) {
      void load(true);
      const expected = capture()!;
      void musicApi
        .getArtists()
        .then(artists => {
          if (owns(expected)) update(current => ({ ...current, artists }));
        })
        .catch(error => {
          if (owns(expected))
            update(current => ({
              ...current,
              enrichmentError: message(
                error,
                "Artist details could not be loaded. Retry unavailable details."
              ),
            }));
        });
    }
    return clearOwner;
  }, [ownerId, owner.generation, cancel, clearOwner, capture, load, owns, update]);

  const react = useCallback(
    async (slide: FeedSlide, emoji: string) => {
      const expected = capture();
      const key = feedSlideKey(slide);
      const previous = stateRef.current.reactions[key];
      const me: User | null = identityApi.getCurrentUser();
      const canonical = previous?.summary?.postId || key;
      if (
        !expected ||
        !owns(expected) ||
        !me ||
        stateRef.current.isLoading ||
        !previous?.ready ||
        !previous.summary ||
        busy.current.has(key) ||
        busy.current.has(canonical) ||
        !slide.postId
      )
        return;
      const aliases = aliasesFor(canonical, key);
      busy.current.add(canonical);
      busy.current.add(key);
      for (const alias of aliases)
        reactionVersions.current.set(alias, (reactionVersions.current.get(alias) || 0) + 1);
      const optimisticAction = previous.summary.myEmojis.includes(emoji) ? "removed" : "added";
      const apply = (action: "added" | "removed") => {
        const summary = previous.summary!;
        const counts = summary.counts.filter(item => item.emoji !== emoji);
        const old = summary.counts.find(item => item.emoji === emoji)?.count || 0;
        const count = Math.max(0, old + (action === "added" ? 1 : -1));
        if (count) counts.push({ emoji, count });
        return {
          ...summary,
          counts,
          total: Math.max(0, summary.total + (action === "added" ? 1 : -1)),
          myEmojis:
            action === "added"
              ? [...new Set([...summary.myEmojis, emoji])]
              : summary.myEmojis.filter(value => value !== emoji),
        };
      };
      update(current => ({
        ...current,
        reacting: visualBusy(),
        reactions: Object.fromEntries(
          Object.entries(current.reactions).map(([alias, value]) => [
            alias,
            aliases.has(alias)
              ? {
                  ...value,
                  ready: false,
                  error: "",
                  ...(alias === key ? { summary: apply(optimisticAction) } : {}),
                }
              : value,
          ])
        ),
      }));
      try {
        const result = await userApi.sendReaction({
          postId: slide.postId,
          toIdentityUserId: slide.identityUserId,
          fromIdentityUserId: me.id,
          fromUserName: me.username,
          emoji,
          contextType: slide.type,
          ...(slide.type === "recent_song" || slide.type === "now_playing"
            ? { songId: slide.songId, songTitle: slide.songTitle, artist: slide.artist }
            : {}),
        });
        if (!owns(expected)) return;
        if (result.action !== "added" && result.action !== "removed")
          throw new Error(
            "The reaction acknowledgement is unavailable. Reload reactions before trying again."
          );
        update(current => ({
          ...current,
          reactions: {
            ...current.reactions,
            [key]: {
              ...previous,
              summary: {
                ...apply(result.action),
                postId: result.postId || previous.summary!.postId,
              },
              ready: false,
            },
          },
          reactionFlash: {
            ...current.reactionFlash,
            [key]: {
              emoji,
              at: Date.now(),
              label: result.action === "added" ? "Reaction added" : "Reaction removed",
            },
          },
        }));
        const oldTimer = flashTimers.current.get(key);
        if (oldTimer) clearTimeout(oldTimer);
        flashTimers.current.set(
          key,
          setTimeout(() => {
            if (owns(expected))
              update(current => {
                const flashes = { ...current.reactionFlash };
                delete flashes[key];
                return { ...current, reactionFlash: flashes };
              });
          }, 1200)
        );
      } catch (error) {
        if (!owns(expected)) return;
        update(current => ({
          ...current,
          reactions: Object.fromEntries(
            Object.entries(current.reactions).map(([alias, value]) => [
              alias,
              aliases.has(alias)
                ? {
                    ...(alias === key ? previous : value),
                    ready: false,
                    loading: false,
                    error: message(
                      error,
                      "The reaction could not be confirmed. Reload reactions before trying again."
                    ),
                  }
                : value,
            ])
          ),
        }));
      } finally {
        if (owns(expected)) {
          busy.current.delete(key);
          busy.current.delete(canonical);
          update(current => ({ ...current, reacting: visualBusy() }));
        }
      }
      if (owns(expected) && !stateRef.current.reactions[key]?.error) {
        await loadReaction(slide, true);
        if (owns(expected))
          window.dispatchEvent(
            new CustomEvent("reaction:refresh", {
              detail: {
                postId: stateRef.current.reactions[key]?.summary?.postId || slide.postId,
                source: seed.current,
              },
            })
          );
      }
    },
    [capture, owns, aliasesFor, visualBusy, update, loadReaction]
  );

  const markSeen = useCallback(
    (slide: FeedSlide) => {
      const expected = capture();
      if (!expected || !owns(expected) || document.hidden) return;
      seen.current[feedSlideKey(slide)] = Date.now();
      try {
        localStorage.setItem(seenKey(expected.id), JSON.stringify(seen.current));
      } catch {
        /* Ranking still works in memory. */
      }
    },
    [capture, owns]
  );
  const retryDetails = useCallback(async () => {
    const expected = capture();
    if (!expected || !owns(expected) || detailsPending.current) return;
    detailsPending.current = true;
    update(current => ({
      ...current,
      enrichmentError: "",
      songs: Object.fromEntries(Object.entries(current.songs).filter(([, song]) => song !== null)),
    }));
    try {
      await Promise.all([
        enrich(stateRef.current.slides, expected),
        musicApi
          .getArtists()
          .then(artists => {
            if (owns(expected)) update(current => ({ ...current, artists }));
          })
          .catch(error => {
            if (owns(expected))
              update(current => ({
                ...current,
                enrichmentError: message(
                  error,
                  "Artist details could not be loaded. Retry unavailable details."
                ),
              }));
          }),
      ]);
    } finally {
      if (owns(expected)) detailsPending.current = false;
    }
  }, [capture, owns, update, enrich]);
  const retryLoad = useCallback(() => load(failedReset.current), [load]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ postId?: string; source?: string }>).detail;
      if (detail?.source === seed.current) return;
      const postId = detail?.postId;
      if (!postId) return;
      for (const slide of stateRef.current.slides) {
        if (
          slide.postId === postId ||
          stateRef.current.reactions[feedSlideKey(slide)]?.summary?.postId === postId
        )
          void loadReaction(slide, true);
      }
    };
    window.addEventListener("reaction:refresh", refresh);
    return () => window.removeEventListener("reaction:refresh", refresh);
  }, [loadReaction]);
  const visible =
    scope.current?.id === owner.me?.id &&
    scope.current?.generation === owner.generation &&
    getSessionGeneration() === owner.generation &&
    getSessionUser()?.id === owner.me?.id;
  return {
    ...(visible ? state : { ...emptyState(), isLoading: !!owner.me }),
    me: owner.me,
    load,
    retryLoad,
    react,
    markSeen,
    retryDetails,
    retryReaction: loadReaction,
  };
}

"use client";

import { Suspense, useCallback, useEffect, useRef, useState, memo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MusicImage from "@/components/ui/MusicImage";
import { identityApi, musicApi, userApi, type Song, type Artist } from "@/lib/api";
import { useAudio } from "@/lib/audio";
import { reactionCache, getCacheKey, type CachedReaction } from "@/lib/reactionCache";

type Slide =
	| {
		type: "recent_song";
		identityUserId: string;
		postId?: string;
		username?: string;
		displayName?: string;
		songId: string;
		songTitle?: string;
		artist?: string;
		coverUrl?: string;
		playedAt?: string;
	}
	| {
		type: "now_playing";
		identityUserId: string;
		songId: string;
		songTitle?: string;
		artist?: string;
		coverUrl?: string;
		positionSec?: number;
		updatedAt?: string;
	}
	| {
		type: "top_artists_week";
		identityUserId: string;
		username?: string;
		displayName?: string;
		topArtists: Array<{ name: string; count: number }>;
	}
	| {
		type: "common_artists";
		identityUserId: string;
		withIdentityUserId: string;
		username?: string;
		displayName?: string;
		commonArtists: string[];
	}
	| {
		type: "top_songs_week";
		identityUserId: string;
		username?: string;
		displayName?: string;
		topSongs: Array<{ songId?: string; songTitle?: string; artist?: string; count: number }>;
	};

function FeedInner() {
	const searchParams = useSearchParams();
	const [slides, setSlides] = useState<Slide[]>([]);
	const slidesRef = useRef<Slide[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const [skip, setSkip] = useState(0);

	// Feed ordering helpers: session-seeded shuffle, author diversity, seen priority
	const sessionSeedRef = useRef<string | null>(null);
	if (!sessionSeedRef.current) {
		// Stable per-tab seed
		sessionSeedRef.current = Math.random().toString(36).slice(2);
	}
	const globalKeySetRef = useRef<Set<string>>(new Set()); // de-dupe across loads
	const lastAuthorRef = useRef<string | null>(null); // boundary de-clump across batches

	// Seen memory with TTL to prioritize unseen posts
	const SEEN_KEY = 'feed_seen_v1';
	const SEEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h
	const seenMapRef = useRef<Record<string, number>>({});
	const loadSeen = useCallback(() => {
		try {
			const raw = typeof window !== 'undefined' ? localStorage.getItem(SEEN_KEY) : null;
			if (!raw) return {} as Record<string, number>;
			const parsed = JSON.parse(raw) as Record<string, number>;
			const now = Date.now();
			const filtered: Record<string, number> = {};
			for (const [k, ts] of Object.entries(parsed)) {
				if (now - ts < SEEN_TTL_MS) filtered[k] = ts;
			}
			return filtered;
		} catch {
			return {} as Record<string, number>;
		}
	}, [SEEN_TTL_MS]);
	const saveSeen = () => {
		try {
			if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, JSON.stringify(seenMapRef.current));
		} catch {}
	};

	// Utility: slide author and key (for dedupe/seen)
	const authorOf = (s: Slide) => s.identityUserId;
	const keyOf = (s: Slide) => {
		const base = `${s.type}:${s.identityUserId}`;
		if (s.type === 'recent_song') {
			const rs = s as Extract<Slide, { type: 'recent_song' }>;
			if (rs.postId) return `${base}:post:${rs.postId}`;
			return `${base}:song:${rs.songId}`;
		}
		if (s.type === 'top_songs_week') {
			const topSongsSlide = s as Extract<Slide, { type: 'top_songs_week' }>;
			const names = topSongsSlide.topSongs?.map(x => (x.songId || x.songTitle || '') + ':' + (x.artist || '')).join('|') || '';
			return `${base}:top_songs:${names}`;
		}
		if (s.type === 'top_artists_week') {
			const topArtistsSlide = s as Extract<Slide, { type: 'top_artists_week' }>;
			const names = topArtistsSlide.topArtists?.map(x => (x.name || '').toLowerCase()).join('|') || '';
			return `${base}:top_artists:${names}`;
		}
		if (s.type === 'common_artists') {
			const commonArtistsSlide = s as Extract<Slide, { type: 'common_artists' }>;
			const withId = commonArtistsSlide.withIdentityUserId || '';
			const names = commonArtistsSlide.commonArtists?.slice(0, 8).map(x => (x || '').toLowerCase()).join('|') || '';
			return `${base}:common:${withId}:${names}`;
		}
		return base;
	};

	// PRNG and chunked shuffle
	const mulberry32 = (a: number) => () => {
		let t = (a += 0x6D2B79F5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const hashString = (str: string) => {
		let h = 2166136261;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
		}
		return h >>> 0;
	};
	const chunkedShuffle = useCallback((arr: Slide[], seedStr: string, chunkSize = 4) => {
		if (arr.length <= 1) return arr.slice();
		const out: Slide[] = [];
		for (let i = 0; i < arr.length; i += chunkSize) {
			const chunk = arr.slice(i, i + chunkSize);
			const rng = mulberry32(hashString(seedStr + ':' + i));
			// Fisher-Yates
			for (let j = chunk.length - 1; j > 0; j--) {
				const k = Math.floor(rng() * (j + 1));
				[chunk[j], chunk[k]] = [chunk[k], chunk[j]];
			}
			out.push(...chunk);
		}
		return out;
	}, []);

	// De-clump by author within a batch and at the boundary with previous author
	const declumpAuthors = useCallback((batch: Slide[]) => {
		if (batch.length <= 1) return batch;
		const res = batch.slice();
		// boundary check
		if (lastAuthorRef.current && authorOf(res[0]) === lastAuthorRef.current) {
			const idx = res.findIndex((s) => authorOf(s) !== lastAuthorRef.current);
			if (idx > 0) {
				const [swap] = res.splice(idx, 1);
				res.unshift(swap);
			}
		}
		// internal pass: avoid 3+ in a row
		for (let i = 1; i < res.length; i++) {
			const prev = authorOf(res[i - 1]);
			const cur = authorOf(res[i]);
			if (prev === cur) {
				const altIdx = res.findIndex((s, j) => j > i && authorOf(s) !== cur);
				if (altIdx > i) {
					const [alt] = res.splice(altIdx, 1);
					res.splice(i, 0, alt);
				}
			}
		}
		// update boundary author
		lastAuthorRef.current = authorOf(res[res.length - 1]);
		return res;
	}, []);

	const [songsById, setSongsById] = useState<Record<string, Song | null>>({});
	const [artists, setArtists] = useState<Artist[]>([]);
	const [userMetaById, setUserMetaById] = useState<Record<string, { avatarUrl?: string; displayName?: string; username?: string }>>({});
	const [reactionsBySlide, setReactionsBySlide] = useState<Record<string, CachedReaction[]>>({});

	// Snap container + sections for one-by-one navigation
	const containerRef = useRef<HTMLDivElement | null>(null);
	const sectionsRef = useRef<Array<HTMLElement | null>>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [scrollLocked, setScrollLocked] = useState(false);
	const [touchStartY, setTouchStartY] = useState<number | null>(null);
	const [reactionFlash, setReactionFlash] = useState<Record<number, { emoji: string; at: number }>>({});

	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Stabilize current user so hooks don't re-create on every render
	const [me] = useState(() => identityApi.getCurrentUser());

	const preloadSongs = useCallback(async (newSlides: Slide[]) => {
		const recentSongIds = newSlides
			.filter((s) => s.type === "recent_song")
			.map((s) => (s as Extract<Slide, { type: "recent_song" }>).songId)
			.filter(Boolean);

		const weekSongIds = newSlides
			.filter((s) => s.type === "top_songs_week")
			.flatMap((s) => (s as Extract<Slide, { type: "top_songs_week" }>).topSongs.map((t) => t.songId).filter(Boolean) as string[]);

		const allIds = Array.from(new Set([...recentSongIds, ...weekSongIds]));
		if (!allIds.length) return;

		const results = await Promise.allSettled(allIds.map((id) => musicApi.getSong(id)));
		const map: Record<string, Song | null> = {};
		results.forEach((r, idx) => {
			const id = allIds[idx];
			map[id] = r.status === "fulfilled" ? r.value : null;
		});
		setSongsById((prev) => ({ ...prev, ...map }));
	}, []);

	const preloadUserMeta = useCallback(async (newSlides: Slide[]) => {
		const ids = new Set<string>();
		newSlides.forEach((s) => {
			ids.add(s.identityUserId);
			if (s.type === "common_artists") {
				ids.add((s as Extract<Slide, { type: "common_artists" }>).withIdentityUserId);
			}
		});
		const missing = Array.from(ids).filter((id) => !userMetaById[id]);
		if (!missing.length) return;

		const profiles = await Promise.allSettled(missing.map((id) => userApi.getUserProfileByIdentityId(id)));
		const meta: Record<string, { avatarUrl?: string; displayName?: string; username?: string }> = {};
		profiles.forEach((res, idx) => {
			const id = missing[idx];
			if (res.status === "fulfilled") meta[id] = { avatarUrl: res.value.avatarUrl, displayName: res.value.displayName, username: res.value.username };
		});
		setUserMetaById((prev) => ({ ...prev, ...meta }));
	}, [userMetaById]);

	const preloadReactions = useCallback(async (newSlides: Slide[]) => {
		if (!newSlides.length) return;

		const reactionPromises = newSlides.map(async (slide) => {
			try {
				const slideKey = keyOf(slide);
				const cacheKey = getCacheKey.slide(slideKey);
				
				// Check cache first
				const cached = reactionCache.get(cacheKey);
				if (cached) {
					return { slideKey, reactions: cached };
				}

				// Generate postId for this slide to fetch reactions
				const postIds: string[] = [];
				
				if (slide.type === 'recent_song') {
					const recentSongSlide = slide as Extract<Slide, { type: 'recent_song' }>;
					if (recentSongSlide.postId) {
						postIds.push(recentSongSlide.postId);
					} else {
						postIds.push(slideKey);
						postIds.push(`recent_song:${slide.identityUserId}:${slide.songId}`);
					}
				} else if (slide.type === 'now_playing') {
					postIds.push(slideKey);
					postIds.push(`now_playing:${slide.identityUserId}:${slide.songId}`);
				} else if (slide.type === 'top_artists_week') {
					const weekStart = new Date();
					weekStart.setDate(weekStart.getDate() - weekStart.getDay());
					const weekKey = weekStart.toISOString().slice(0, 10).replace(/-/g, '');
					postIds.push(`weekly:artists:${slide.identityUserId}:${weekKey}`);
				} else if (slide.type === 'top_songs_week') {
					const weekStart = new Date();
					weekStart.setDate(weekStart.getDate() - weekStart.getDay());
					const weekKey = weekStart.toISOString().slice(0, 10).replace(/-/g, '');
					postIds.push(`weekly:songs:${slide.identityUserId}:${weekKey}`);
				} else if (slide.type === 'common_artists') {
					const weekStart = new Date();
					weekStart.setDate(weekStart.getDate() - weekStart.getDay());
					const weekKey = weekStart.toISOString().slice(0, 10).replace(/-/g, '');
					postIds.push(`common:${me?.id}:${slide.identityUserId}:${weekKey}`);
				}

				// Try each postId format until we find reactions
				let allReactions: CachedReaction[] = [];
				for (const postId of postIds) {
					try {
						const reactions = await userApi.getReactionsByPost(postId, me?.id);
						if (reactions && reactions.length > 0) {
							allReactions = [...allReactions, ...reactions];
						}
					} catch {
						// Silently continue to next postId format
					}
				}

				// Store in cache
				reactionCache.set(cacheKey, allReactions);

				return { slideKey, reactions: allReactions };
			} catch (error) {
				console.warn('Failed to load reactions for slide:', error);
				return { slideKey: keyOf(slide), reactions: [] };
			}
		});

		const results = await Promise.allSettled(reactionPromises);
		const newReactions: Record<string, CachedReaction[]> = {};

		results.forEach(result => {
			if (result.status === 'fulfilled' && result.value) {
				newReactions[result.value.slideKey] = result.value.reactions;
			}
		});

		setReactionsBySlide(prev => ({ ...prev, ...newReactions }));
	}, [me?.id]);

	const loadSlides = useCallback(
		async (reset = false) => {
			if (!me) {
				setError("Please log in");
				setIsLoading(false);
				return;
			}

			try {
				if (reset) {
					setIsLoading(true);
					setSkip(0);
					setHasMore(true);
					setSlides([]);
					globalKeySetRef.current = new Set();
					lastAuthorRef.current = null;
				} else {
					setIsLoadingMore(true);
				}

				setError(null);
				const currentSkip = reset ? 0 : skip;
				const data = await userApi.getFeedSlides(me.id, 10, currentSkip);
				const newSlides = Array.isArray(data) ? (data as Slide[]) : [];

				// Build processed batch: de-dupe, prioritize unseen, light shuffle, de-clump
				if (reset) {
					seenMapRef.current = loadSeen();
				}
				const batchUnique: Slide[] = [];
				for (const s of newSlides) {
					const k = keyOf(s);
					if (globalKeySetRef.current.has(k)) continue; // drop duplicates across pages
					globalKeySetRef.current.add(k);
					batchUnique.push(s);
				}

				// Unseen first within the batch
				const seed = `${sessionSeedRef.current}:${currentSkip}`;
				const unseen = batchUnique.filter((s) => !(keyOf(s) in seenMapRef.current));
				const seen = batchUnique.filter((s) => keyOf(s) in seenMapRef.current);
				const shuffledUnseen = chunkedShuffle(unseen, seed, 4);
				const reordered = declumpAuthors([...shuffledUnseen, ...seen]);

				if (!newSlides.length) setHasMore(false);
				setSlides((prev) => (reset ? reordered : [...prev, ...reordered]));
				setSkip(currentSkip + newSlides.length);

				// parallel preloads (for processed batch)
				await Promise.allSettled([preloadSongs(reordered), preloadUserMeta(reordered), preloadReactions(reordered)]);
			} catch (e) {
				console.error("Failed to load slides:", e);
				setError("Failed to load feed");
			} finally {
				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[me, skip, preloadSongs, preloadUserMeta, preloadReactions, chunkedShuffle, declumpAuthors, loadSeen]
	);

	// keep a live ref of slides for deep-link fallback logic
	useEffect(() => { slidesRef.current = slides; }, [slides]);

	// initial load once with safety checks
	useEffect(() => {
		if (!me?.id) {
			console.log("Feed: User not authenticated yet, skipping load");
			return;
		}
		
		// Small delay to ensure user context is fully loaded
		const timeoutId = setTimeout(() => {
			loadSlides(true);
		}, 100);

		return () => clearTimeout(timeoutId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [me?.id]);

	// Retry mechanism if feed is empty but user is authenticated
	useEffect(() => {
		if (me?.id && !isLoading && !isLoadingMore && slides.length === 0 && !error) {
			console.log("Feed: Retrying load due to empty feed");
			const retryTimeout = setTimeout(() => {
				loadSlides(true);
			}, 1000);
			return () => clearTimeout(retryTimeout);
		}
	}, [me?.id, isLoading, isLoadingMore, slides.length, error, loadSlides]);

	// deep-link: focus a slide based on query params (with fallback)
	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			if (!slides.length) return;
			const postId = searchParams?.get("postId");
			const type = searchParams?.get("focusType");
			const to = searchParams?.get("to");
			const songId = searchParams?.get("songId");
			// find in current slides
			const matchIndex = (arr: Slide[]) => arr.findIndex((s) => {
				// Prefer postId for any slide type
				if (postId && 'postId' in s && s.postId === postId) return true;
				if (!type || !to) return false;
				if (s.identityUserId !== to) return false;
				if (s.type !== (type as Slide["type"])) return false;
				if (type === "recent_song" && songId) {
					return (s as Extract<Slide, { type: "recent_song" }>).songId === songId;
				}
				return true;
			});
			let idx = matchIndex(slides);
			if (idx >= 0) {
				setTimeout(() => !cancelled && scrollToIndex(idx), 50);
				return;
			}
			// fallback: attempt to load more until found or no more
			let attempts = 0;
			while (attempts < 3 && hasMore && !cancelled) {
				await loadSlides(false);
				idx = matchIndex(slidesRef.current || slides);
				if (idx >= 0) {
					setTimeout(() => !cancelled && scrollToIndex(idx), 50);
					break;
				}
				attempts++;
			}
		};
		run();
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [slides.length]);

	// artists cache once
	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const all = await musicApi.getArtists();
				if (mounted) setArtists(all);
			} catch (e) {
				console.warn("Failed to load artists", e);
			}
		})();
		return () => {
			mounted = false;
		};
	}, []);

	// infinite scroll sentinel (within snap container)
	useEffect(() => {
		const el = sentinelRef.current;
		const root = containerRef.current;
		if (!el || !root) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry.isIntersecting && hasMore && !isLoadingMore) {
					loadSlides(false);
				}
			},
			{ root, rootMargin: "800px", threshold: 0 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, isLoadingMore, loadSlides]);

	// track current section in view for prev/next controls
	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const sections = sectionsRef.current.filter(Boolean) as HTMLElement[];
		if (!sections.length) return;
		const observer = new IntersectionObserver(
			(entries) => {
				// pick the entry with highest intersection ratio
				let top: { idx: number; ratio: number } | null = null;
				for (const e of entries) {
					const idx = sections.indexOf(e.target as HTMLElement);
					if (idx >= 0) {
						const ratio = (e as IntersectionObserverEntry).intersectionRatio || 0;
						if (!top || ratio > top.ratio) top = { idx, ratio };
					}
				}
				if (top) setCurrentIndex(top.idx);
			},
			{ root, threshold: [0.4, 0.6, 0.8] }
		);
		sections.forEach((s) => observer.observe(s));
		return () => observer.disconnect();
	}, [slides.length]);

	// Mark current slide as seen with TTL persistence
	useEffect(() => {
		const s = slides[currentIndex];
		if (!s) return;
		const k = keyOf(s);
		seenMapRef.current[k] = Date.now();
		saveSeen();
	}, [currentIndex, slides]);

	const scrollToIndex = useCallback((idx: number) => {
		const sections = sectionsRef.current.filter(Boolean) as HTMLElement[];
		if (idx < 0 || idx >= sections.length) return;
		sections[idx].scrollIntoView({ behavior: "smooth", block: "start" });
	}, []);

	// Enforce one-post-at-a-time navigation (wheel/touch)
	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const onWheel = (e: WheelEvent) => {
			if (scrollLocked) return;
			const delta = e.deltaY;
			if (Math.abs(delta) < 24) return;
			e.preventDefault();
			setScrollLocked(true);
			const next = delta > 0 ? currentIndex + 1 : currentIndex - 1;
			scrollToIndex(next);
			setTimeout(() => setScrollLocked(false), 650);
		};
		const onTouchStart = (e: TouchEvent) => {
			setTouchStartY(e.touches[0]?.clientY ?? null);
		};
		const onTouchMove = (e: TouchEvent) => {
			if (scrollLocked || touchStartY == null) return;
			const dy = (e.touches[0]?.clientY ?? touchStartY) - touchStartY;
			if (Math.abs(dy) < 32) return;
			e.preventDefault();
			setScrollLocked(true);
			const next = dy < 0 ? currentIndex + 1 : currentIndex - 1;
			scrollToIndex(next);
			setTimeout(() => setScrollLocked(false), 650);
			setTouchStartY(null);
		};
		root.addEventListener("wheel", onWheel, { passive: false });
		root.addEventListener("touchstart", onTouchStart, { passive: true });
		root.addEventListener("touchmove", onTouchMove, { passive: false });
		return () => {
			root.removeEventListener("wheel", onWheel);
			root.removeEventListener("touchstart", onTouchStart);
			root.removeEventListener("touchmove", onTouchMove);
		};
	}, [currentIndex, scrollLocked, touchStartY, scrollToIndex]);

	const handleReact = useCallback(
		async (target: Slide, emoji: string, index?: number) => {
			if (!me) return;
			
			const slideKey = keyOf(target);
			const cacheKey = getCacheKey.slide(slideKey);
			const existingReactions = reactionsBySlide[slideKey] || [];
			
			// Check if user already reacted with this emoji
			const hasReacted = existingReactions.some(r => r.emoji === emoji && r.fromIdentityUserId === me.id);
			const action = hasReacted ? 'remove' : 'add';
			
			// Optimistic update
			const optimisticReactions = reactionCache.optimisticUpdate(
				cacheKey,
				me.id,
				emoji,
				action,
				{
					emoji,
					fromIdentityUserId: me.id,
					fromUserName: me.username,
					toIdentityUserId: target.identityUserId,
					createdAt: new Date().toISOString(),
					contextType: target.type,
					songId: target.type === 'recent_song' || target.type === 'now_playing' ? target.songId : undefined,
					songTitle: target.type === 'recent_song' || target.type === 'now_playing' ? target.songTitle : undefined,
					artist: target.type === 'recent_song' || target.type === 'now_playing' ? target.artist : undefined
				}
			);

			if (optimisticReactions) {
				setReactionsBySlide(prev => ({
					...prev,
					[slideKey]: optimisticReactions
				}));
			}

			try {
				const base = {
					toIdentityUserId: target.identityUserId,
					fromIdentityUserId: me.id,
					fromUserName: me.username,
					emoji,
				};
				let postId: string | undefined;
				if (target.type === "recent_song") {
					postId = (target as Extract<Slide, { type: 'recent_song' }>).postId;
					await userApi.sendReaction({
						...base,
						contextType: "recent_song",
						postId,
						songId: target.songId,
						songTitle: target.songTitle,
						artist: target.artist,
					});
				} else if (target.type === "top_artists_week") {
					postId = 'postId' in target ? String(target.postId) : undefined;
					await userApi.sendReaction({ ...base, contextType: "top_artists_week", postId });
				} else if (target.type === "common_artists") {
					postId = 'postId' in target ? String(target.postId) : undefined;
					await userApi.sendReaction({ ...base, contextType: "common_artists", postId });
				} else if (target.type === "top_songs_week") {
					postId = 'postId' in target ? String(target.postId) : undefined;
					await userApi.sendReaction({ ...base, contextType: "top_songs_week", postId });
				}
				
				if (typeof index === 'number') {
					setReactionFlash(prev => ({ ...prev, [index]: { emoji, at: Date.now() } }));
					setTimeout(() => {
						setReactionFlash(prev => {
							const copy = { ...prev };
							delete copy[index!];
							return copy;
						});
					}, 1200);
				}
				
				if (postId) {
					window.dispatchEvent(new CustomEvent('reaction:refresh', { detail: { postId } }));
				}
			} catch (e) {
				console.error("Failed to send reaction:", e);
				
				// Revert optimistic update on error
				reactionCache.invalidate(cacheKey);
				setReactionsBySlide(prev => ({
					...prev,
					[slideKey]: existingReactions
				}));
			}
		},
		[me, reactionsBySlide]
	);

	const UserHeader = memo(({ slide, userMeta }: { 
		slide: Slide;
		userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
	}) => {
		const getSlideDisplayName = (slide: Slide): string | undefined => {
			switch (slide.type) {
				case 'top_artists_week':
				case 'top_songs_week':
				case 'common_artists':
					return slide.displayName;
				default:
					return undefined;
			}
		};
		
		const getSlideUsername = (slide: Slide): string | undefined => {
			switch (slide.type) {
				case 'top_artists_week':
				case 'top_songs_week':
				case 'common_artists':
					return slide.username;
				default:
					return undefined;
			}
		};
		
		const name = userMeta?.displayName || userMeta?.username || getSlideDisplayName(slide) || getSlideUsername(slide) || "User";
		return (
			<div className="flex items-center gap-3">
				<MusicImage src={userMeta?.avatarUrl} alt={name} type="circle" size="medium" className="w-10 h-10" />
				<Link href={`/user/${slide.identityUserId}`} className="text-white font-medium hover:underline">
					{name}
				</Link>
			</div>
		);
	});
	UserHeader.displayName = 'UserHeader';

		const Card = ({ children }: { children: React.ReactNode }) => (
		<div className="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-4 shadow-md w-full max-w-2xl">
			{children}
		</div>
	);

	const ReactionBar = ({ slide, index }: { slide: Slide; index: number }) => {
		const flash = reactionFlash[index];
		const slideKey = keyOf(slide);
		const existingReactions = reactionsBySlide[slideKey] || [];
		
		return (
			<div className="pointer-events-none fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 items-center z-20">
				{["👍", "🔥", "😍", "😂", "👏", "😮"].map((em) => {
					const hasReacted = existingReactions.some(r => r.emoji === em && r.fromIdentityUserId === me?.id);
					return (
						<button
							key={em}
							onClick={(e) => { e.stopPropagation(); handleReact(slide, em, index); }}
							className={`pointer-events-auto w-10 h-10 rounded-full text-lg flex items-center justify-center transform-gpu transition-transform duration-150 active:scale-95 ${
								flash?.emoji === em ? 'ring-2 ring-purple-400 animate-pulse' : ''
							} ${
								hasReacted 
									? 'bg-purple-600/50 hover:bg-purple-600/70 text-white' 
									: 'bg-white/10 hover:bg-white/20 text-white/80'
							}`}
							style={{ willChange: 'transform' }}
							title={`${hasReacted ? 'Remove' : 'Add'} ${em} reaction`}
						>
							{em}
						</button>
					);
				})}
				{flash && (
					<div className="pointer-events-none mt-2 text-xs px-2 py-1 rounded bg-purple-600/80 text-white">Sent</div>
				)}
			</div>
		);
	};

	const ReactionCluster = ({ slide }: { slide: Slide }) => {
		const slideKey = keyOf(slide);
		const reactions = reactionsBySlide[slideKey] || [];
		const [open, setOpen] = useState(false);
		
		if (!reactions.length) {
			return (
				<div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-30">
					<span className="text-xs text-white/40">💬</span>
				</div>
			);
		}
		
		const counts = reactions.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {});
		const items = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6);
		return (
			<div>
				<button className="flex -space-x-2" onClick={() => setOpen(true)} aria-label="View reactions">
					{items.map(([em, count]) => (
						<span key={em} className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-base">
							{em}
							<span className="absolute -bottom-1 -right-1 text-[10px] bg-purple-600 text-white rounded px-1">{count}</span>
						</span>
					))}
				</button>
				{open && (
					<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
						<div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
							<div className="flex items-center justify-between mb-2">
								<div className="text-white font-semibold">Reactions</div>
								<button className="text-gray-400 hover:text-white" onClick={() => setOpen(false)}>✕</button>
							</div>
							<div className="max-h-80 overflow-y-auto space-y-2">
								{reactions.map((r, i) => (
									<div key={i} className="flex items-center justify-between bg-white/5 rounded-lg p-2">
										<div className="flex items-center gap-2">
											<span className="text-xl">{r.emoji}</span>
											<Link href={`/user/${r.fromIdentityUserId}`} className="text-purple-300 hover:underline">{r.fromUserName || 'User'}</Link>
										</div>
										<span className="text-gray-500 text-xs">{new Date(r.createdAt).toLocaleString()}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</div>
		);
	};

	const RecentSongCard = memo(({ slide, song, userMeta }: { 
		slide: Extract<Slide, { type: "recent_song" }>;
		song: Song | null;
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
				<div className="flex items-start gap-4">
					<div className="flex-1">
						<UserHeader slide={slide} userMeta={userMeta} />
						<div className="mt-4 flex items-center gap-4">
							<button
								className="w-28 h-28 rounded-xl overflow-hidden bg-white/5 flex-shrink-0"
								onClick={() => song && playSong(song)}
								title="Play"
							>
								<MusicImage src={song?.coverUrl || slide.coverUrl} alt={slide.songTitle || "Song"} size="large" className="w-full h-full" />
							</button>
							<div className="min-w-0">
								<div className="text-white text-xl font-semibold truncate">{slide.songTitle}</div>
								<div className="text-gray-300 truncate">
									{song?.artists?.length
										? song.artists.map((a, i) => (
											<Link key={a.id || `${a.name}-${i}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
												{a.name}{i < (song?.artists?.length || 0) - 1 ? ', ' : ''}
											</Link>
										))
										: slide.artist}
								</div>
								{(song as any)?.album?.id && (
									<Link href={`/album/${(song as any).album.id}`} className="text-purple-300 text-sm hover:underline">View album</Link>
								)}
								{slide.playedAt && (
									<div className="text-gray-400 text-xs mt-1">{new Date(slide.playedAt).toLocaleDateString()}</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</Card>
		);
	});
	RecentSongCard.displayName = 'RecentSongCard';

	const TopArtistsCard = memo(({ slide, userMeta }: { 
		slide: Extract<Slide, { type: "top_artists_week" }>;
		userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
	}) => (
		<Card>
			<div className="relative">
				{/* Reaction cluster - always visible at top right */}
				<div className="absolute right-3 top-3 z-10">
					<ReactionCluster slide={slide} />
				</div>
				<div className="flex items-center justify-between">
					<UserHeader slide={slide} userMeta={userMeta} />
					<div className="text-white/60 text-xs">Top artists this week</div>
				</div>
				<div className="mt-4 grid grid-cols-1 gap-3">
					{slide.topArtists.slice(0, 5).map((a, i) => {
						const artistDetails = artists.find((ar) => ar.name.toLowerCase() === a.name.toLowerCase());
						return (
							<div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
								<div className="w-12 h-12 rounded-lg overflow-hidden">
									<MusicImage src={artistDetails?.imageUrl} alt={a.name} size="medium" className="w-12 h-12" />
								</div>
								<div className="text-left flex-1 min-w-0">
										{artistDetails?.id ? (
											<Link href={`/artist/${artistDetails.id}`} className="text-white font-semibold truncate hover:underline">{a.name}</Link>
										) : (
											<div className="text-white font-semibold truncate">{a.name}</div>
										)}
									<div className="text-gray-300 text-xs">{a.count} plays</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</Card>
	));
	TopArtistsCard.displayName = 'TopArtistsCard';

	const TopSongsCard = memo(({ slide, songsById, userMeta }: { 
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
				<div className="flex items-center justify-between">
					<UserHeader slide={slide} userMeta={userMeta} />
					<div className="text-white/60 text-xs">Top songs this week</div>
				</div>
				<div className="mt-4 grid grid-cols-1 gap-3">
					{slide.topSongs.slice(0, 5).map((ts, i) => {
						const song = ts.songId ? songsById[ts.songId] : null;
						const title = song?.title || ts.songTitle || "Unknown Song";
						const artistName = song?.artists?.map((a) => a.name).join(", ") || ts.artist || "Unknown Artist";
						return (
							<div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
								{(song as any)?.album?.id ? (
									<Link href={`/album/${(song as any).album.id}`} className="w-12 h-12 rounded-lg overflow-hidden">
										<MusicImage src={song?.coverUrl} alt={title} size="medium" className="w-12 h-12" />
									</Link>
								) : (
									<div className="w-12 h-12 rounded-lg overflow-hidden">
										<MusicImage src={song?.coverUrl} alt={title} size="medium" className="w-12 h-12" />
									</div>
								)}
								<div className="text-left flex-1 min-w-0">
									<div className="text-white font-semibold truncate">{title}</div>
									<div className="text-gray-300 text-xs truncate">
										{(song as any)?.artists?.length
											? ((song as any).artists as any[]).map((a: any, j: number) => (
												<Link key={a.id || `${a.name}-${j}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
													{a.name}{j < (((song as any)?.artists?.length) || 0) - 1 ? ', ' : ''}
												</Link>
											))
											: artistName}
										<span className="text-gray-500"> • {ts.count} plays</span>
									</div>
								</div>
								<button onClick={(e) => { e.stopPropagation(); if (song) playSong(song as any); }} className="px-3 py-1 text-sm rounded-lg bg-white/10 hover:bg-white/20">
									Play
								</button>
							</div>
						);
					})}
				</div>
			</div>
		</Card>
		);
	});
	TopSongsCard.displayName = 'TopSongsCard';

	const NowPlayingCard = memo(({ slide, song, userMeta }: { 
		slide: Extract<Slide, { type: "now_playing" }>;
		song: Song | null;
		userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
	}) => {
		const { playSong } = useAudio();
		
		return (
		<Card>
			<div className="flex items-start gap-4">
				<div className="flex-1">
					<div className="flex items-center justify-between">
						<UserHeader slide={slide} userMeta={userMeta} />
						<span className="text-green-300 text-xs bg-green-500/10 border border-green-400/30 px-2 py-0.5 rounded">Now Playing</span>
					</div>
					<div className="mt-4 flex items-center gap-4">
						<button
							className="w-28 h-28 rounded-xl overflow-hidden bg-emerald-900/30 ring-1 ring-emerald-600/30 flex-shrink-0"
							onClick={() => song && playSong(song as any)}
							title="Play"
						>
							<MusicImage src={song?.coverUrl || slide.coverUrl} alt={slide.songTitle || "Song"} size="large" className="w-full h-full" />
						</button>
						<div className="min-w-0">
							<div className="text-white text-xl font-semibold truncate">{slide.songTitle || 'Listening now'}</div>
							<div className="text-gray-200 truncate">
								{song?.artists?.length
									? (song!.artists as any[]).map((a: any, i: number) => (
										<Link key={a.id || `${a.name}-${i}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
											{a.name}{i < ((song as any)?.artists?.length || 0) - 1 ? ', ' : ''}
										</Link>
									))
									: slide.artist}
							</div>
							{(song as any)?.album?.id && (
								<Link href={`/album/${(song as any).album.id}`} className="text-emerald-300 text-sm hover:underline">View album</Link>
							)}
							{typeof slide.positionSec === 'number' && (
								<div className="text-emerald-300/90 text-xs mt-1">{Math.floor((slide.positionSec || 0) / 60)}:{String((slide.positionSec || 0) % 60).padStart(2,'0')} elapsed</div>
							)}
							{slide.updatedAt && (
								<div className="text-gray-400 text-xs mt-1">Updated {new Date(slide.updatedAt).toLocaleTimeString()}</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</Card>
		);
	});
	NowPlayingCard.displayName = 'NowPlayingCard';

	const CommonArtistsCard = memo(({ slide, userMeta }: { 
		slide: Extract<Slide, { type: "common_artists" }>;
		userMeta?: { displayName?: string; username?: string; avatarUrl?: string } | null;
	}) => (
		<Card>
			<div className="relative">
				{/* Reaction cluster - always visible at top right */}
				<div className="absolute right-3 top-3 z-10">
					<ReactionCluster slide={slide} />
				</div>
				<div className="flex items-center justify-between">
					<UserHeader slide={slide} userMeta={userMeta} />
					<div className="text-white/60 text-xs">Artists in common</div>
				</div>
				<div className="mt-4 grid grid-cols-1 gap-3">
					{slide.commonArtists.slice(0, 5).map((artist, i) => {
						const artistDetails = artists.find((ar) => ar.name.toLowerCase() === artist.toLowerCase());
						return (
							<div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
								<div className="w-12 h-12 rounded-lg overflow-hidden">
									<MusicImage src={artistDetails?.imageUrl} alt={artist} size="medium" className="w-12 h-12" />
								</div>
								<div className="text-left flex-1 min-w-0">
									{artistDetails?.id ? (
										<Link href={`/artist/${artistDetails.id}`} className="text-white font-semibold truncate hover:underline">{artist}</Link>
									) : (
										<div className="text-white font-semibold truncate">{artist}</div>
									)}
									<div className="text-gray-300 text-xs">Shared artist</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</Card>
	));
	CommonArtistsCard.displayName = 'CommonArtistsCard';

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
		<>
			<div className="relative">
				{isLoading && !slides.length ? (
					<div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
						{[...Array(3)].map((_, i) => (
							<div key={i} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 animate-pulse">
								<div className="h-4 bg-gray-800 rounded w-1/3"></div>
								<div className="mt-4 h-28 bg-gray-800 rounded"></div>
							</div>
						))}
					</div>
				) : error ? (
					<div className="px-4 pt-4 text-center text-red-400">
						{error}
						<div className="mt-3">
							<button onClick={() => loadSlides(true)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
								Retry
							</button>
						</div>
					</div>
				) : slides.length === 0 ? (
					<div className="px-4 pt-4 text-center text-gray-300">No content yet. Follow friends to see their activity.</div>
				) : (
					<>
						<div
							ref={containerRef}
							className="h-[calc(100vh-12rem)] overflow-y-auto overscroll-contain snap-y snap-mandatory"
						>
							{slides.map((slide, idx) => (
								<section
									key={idx}
									ref={(el) => { sectionsRef.current[idx] = el; }}
									className="relative snap-start min-h-full flex items-center justify-center px-4 pr-24"
								>
									{slide.type === "recent_song" && <RecentSongCard slide={slide} song={songsById[slide.songId] || null} userMeta={userMetaById[slide.identityUserId]} />}
									{(slide as any).type === "now_playing" && <NowPlayingCard slide={slide as any} song={songsById[(slide as any).songId] || null} userMeta={userMetaById[(slide as any).identityUserId]} />}
									{slide.type === "top_artists_week" && <TopArtistsCard slide={slide} userMeta={userMetaById[slide.identityUserId]} />}
									{slide.type === "top_songs_week" && <TopSongsCard slide={slide} songsById={songsById} userMeta={userMetaById[slide.identityUserId]} />}
									{slide.type === "common_artists" && <CommonArtistsCard slide={slide as any} userMeta={userMetaById[(slide as any).identityUserId]} />}

									{/* Right-side reactions shown only for the active slide to avoid duplicates */}
									{idx === currentIndex && <ReactionBar slide={slide} index={idx} />}
								</section>
							))}

							{/* Loading card in its own snap section */}
							{isLoadingMore && (
								<section className="snap-start min-h-full flex items-center justify-center px-4">
									<div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 animate-pulse w-full max-w-2xl">
										<div className="h-4 bg-gray-800 rounded w-1/3"></div>
										<div className="mt-4 h-28 bg-gray-800 rounded"></div>
									</div>
								</section>
							)}

							{/* End-of-feed section */}
							{!hasMore && (
								<section className="snap-start min-h-full flex items-center justify-center px-4">
									<div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-300 w-full max-w-2xl">
										You&apos;re all caught up. No more posts for now.
									</div>
								</section>
							)}

							{/* Sentinel at the bottom for preloading more */}
							{hasMore && (
								<section className="snap-start min-h-full flex items-center justify-center px-4">
									<div ref={sentinelRef} className="h-1 w-full" />
								</section>
							)}
						</div>

						{/* Prev/Next controls */}
						<div className="pointer-events-none absolute inset-y-0 left-4 flex flex-col justify-center gap-3">
							<button
								className="pointer-events-auto px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-40"
								disabled={currentIndex <= 0}
								onClick={() => scrollToIndex(currentIndex - 1)}
								aria-label="Previous post"
							>
								▲
							</button>
							<button
								className="pointer-events-auto px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-40"
								disabled={currentIndex >= slides.length - 1 && !hasMore}
								onClick={() => scrollToIndex(currentIndex + 1)}
								aria-label="Next post"
							>
								▼
							</button>
						</div>
					</>
				)}
			</div>
		</>
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


"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import MusicImage from "@/components/ui/MusicImage";
import { identityApi, musicApi, userApi, type Song, type Artist } from "@/lib/api";
import { useAudio } from "@/lib/audio";

interface Reaction {
	emoji: string;
	fromIdentityUserId: string;
	fromUserName?: string;
	count?: number;
}

type Slide =
	| {
		type: "recent_song";
		identityUserId: string;
		username?: string;
		displayName?: string;
		songId: string;
		songTitle?: string;
		artist?: string;
		coverUrl?: string;
		playedAt?: string;
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
	}, [SEEN_TTL_MS]); // Include SEEN_TTL_MS dependency
	const saveSeen = () => {
		try {
			if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, JSON.stringify(seenMapRef.current));
		} catch {}
	};

	// Utility: slide key (for dedupe/seen)
	const keyOf = (s: Slide) => {
		const base = `${s.type}:${s.identityUserId}`;
		if (s.type === 'recent_song') return `${base}:song:${s.songId}`;
		if (s.type === 'top_songs_week') {
			const names = s.topSongs?.map((x) => (x.songId || x.songTitle || '') + ':' + (x.artist || '')).join('|') || '';
			return `${base}:top_songs:${names}`;
		}
		if (s.type === 'top_artists_week') {
			const names = s.topArtists?.map((x) => (x.name || '').toLowerCase()).join('|') || '';
			return `${base}:top_artists:${names}`;
		}
		if (s.type === 'common_artists') {
			const withId = s.withIdentityUserId || '';
			const names = s.commonArtists?.slice(0, 8).map((x) => (x || '').toLowerCase()).join('|') || '';
			return `${base}:common:${withId}:${names}`;
		}
		return base;
	};

	const [songsById, setSongsById] = useState<Record<string, Song | null>>({});
	const [artists, setArtists] = useState<Artist[]>([]);
	const [userMetaById, setUserMetaById] = useState<Record<string, { avatarUrl?: string }>>({});
	const [reactionsBySlide, setReactionsBySlide] = useState<Record<string, Reaction[]>>({});

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

	// Audio controls for play actions from feed
	const { playSong } = useAudio();

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
		const meta: Record<string, { avatarUrl?: string }> = {};
		profiles.forEach((res, idx) => {
			const id = missing[idx];
			if (res.status === "fulfilled") meta[id] = { avatarUrl: res.value.avatarUrl };
		});
		setUserMetaById((prev) => ({ ...prev, ...meta }));
	}, [userMetaById]); // Include userMetaById since we read it inside the function

	const preloadReactions = useCallback(async (newSlides: Slide[]) => {
		if (!newSlides.length) return;

		const reactionPromises = newSlides.map(async (slide) => {
			try {
				const slideKey = keyOf(slide);
				
				// Generate postId for this slide to fetch reactions - use multiple formats
				const postIds = [];
				
				if (slide.type === 'recent_song') {
					// Use the slideKey format as the primary format
					postIds.push(slideKey); // This will be something like "recent_song:userId:song:songId"
					// Also try the simple format 
					postIds.push(`recent_song:${slide.identityUserId}:${slide.songId}`);
					// Also try the feed item ID format (found in slide.feedId if it exists)
					if ('feedId' in slide) {
						postIds.push(slide.feedId as string);
					}
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
				let allReactions: Reaction[] = [];
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

				if (allReactions.length > 0) {
					// Group reactions by emoji and count them
					const groupedReactions: Record<string, {
						emoji: string;
						fromIdentityUserId: string;
						fromUserName?: string;
						count: number;
					}> = {};
					
					allReactions.forEach((reaction: Reaction) => {
						if (!groupedReactions[reaction.emoji]) {
							groupedReactions[reaction.emoji] = {
								emoji: reaction.emoji,
								fromIdentityUserId: reaction.fromIdentityUserId,
								fromUserName: reaction.fromUserName,
								count: 1
							};
						} else {
							groupedReactions[reaction.emoji].count++;
						}
					});

					// Use slideKey for consistency
					return { slideKey, reactions: Object.values(groupedReactions) };
				}
			} catch (error) {
				console.warn('Failed to load reactions for slide:', error);
			}
			return { slideKey: keyOf(slide), reactions: [] };
		});

		const results = await Promise.allSettled(reactionPromises);
		const newReactions: Record<string, Reaction[]> = {};

		results.forEach(result => {
			if (result.status === 'fulfilled' && result.value) {
				newReactions[result.value.slideKey] = result.value.reactions;
			}
		});

		setReactionsBySlide(prev => ({ ...prev, ...newReactions }));
	}, [me?.id]); // Remove userMetaById as it's not actually used in this function

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

				// Skip processing if no new slides and this is not a reset
				if (newSlides.length === 0 && !reset) {
					setHasMore(false);
					setIsLoading(false);
					setIsLoadingMore(false);
					return;
				}

				// Build processed batch: de-dupe, prioritize unseen, light shuffle, de-clump
				if (reset) {
					seenMapRef.current = loadSeen();
				}
				
				// TEMPORARY: Skip all complex processing and just show raw slides
				const reordered = newSlides;

				if (!newSlides.length) setHasMore(false);
				
				// Only update slides if we have content OR this is a reset
				if (reordered.length > 0 || reset) {
					setSlides((prev) => (reset ? reordered : [...prev, ...reordered]));
				}
				
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
		[me, skip, preloadSongs, preloadUserMeta, preloadReactions, loadSeen] // Add missing dependencies
	);

	// keep a live ref of slides for deep-link fallback logic
	useEffect(() => { 
		slidesRef.current = slides; 
	}, [slides]);

	// initial load once
	useEffect(() => {
		loadSlides(true);
	}, [me?.id, loadSlides]); // Include loadSlides dependency

	// deep-link: focus a slide based on query params (with fallback)
	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			if (!slides.length) return;
			const type = searchParams?.get("focusType");
			const to = searchParams?.get("to");
			const songId = searchParams?.get("songId");
			if (!type || !to) return;
			// find in current slides
			const matchIndex = (arr: Slide[]) => arr.findIndex((s) => {
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
	}, [slides.length]); // Keep minimal dependencies to avoid circular issues

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
			console.log("🎯 handleReact called:", { target: target.type, emoji, me: me.id });

			const slideKey = keyOf(target);
			const existingReactions = reactionsBySlide[slideKey] || [];
			console.log("📊 Current reactions for slide:", { slideKey, existingReactions });

			try {
				const base = {
					toIdentityUserId: target.identityUserId,
					fromIdentityUserId: me.id,
					fromUserName: me.username,
					emoji,
				};

				// Send the reaction to the server first to get the actual action
				let response;
				if (target.type === "recent_song") {
					response = await userApi.sendReaction({
						...base,
						contextType: "recent_song",
						songId: target.songId,
						songTitle: target.songTitle,
						artist: target.artist,
					});
				} else if (target.type === "top_artists_week") {
					response = await userApi.sendReaction({ ...base, contextType: "top_artists_week" });
				} else if (target.type === "common_artists") {
					response = await userApi.sendReaction({ ...base, contextType: "common_artists" });
				} else if (target.type === "top_songs_week") {
					response = await userApi.sendReaction({ ...base, contextType: "top_songs_week" });
				}

				console.log("🚀 Server response:", response);

				// Update UI based on server response
				if (response?.action === "removed") {
					// Remove the reaction from UI
					const updatedReactions = existingReactions.filter(r => !(r.emoji === emoji && r.fromIdentityUserId === me.id));
					console.log("❌ Removing reaction, updated reactions:", updatedReactions);
					setReactionsBySlide(prev => ({
						...prev,
						[slideKey]: updatedReactions
					}));
				} else if (response?.action === "added") {
					// Add the reaction to UI
					const newReaction = {
						emoji,
						fromIdentityUserId: me.id,
						fromUserName: me.username,
						count: 1
					};
					const updatedReactions = [...existingReactions, newReaction];
					console.log("✅ Adding reaction, updated reactions:", updatedReactions);
					setReactionsBySlide(prev => ({
						...prev,
						[slideKey]: updatedReactions
					}));
				}

				// Show flash effect
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
			} catch (e) {
				console.error("Failed to send reaction:", e);
			}
		},
		[me, reactionsBySlide]
	);

	const UserHeader = ({ slide }: { slide: Slide }) => {
		const meta = userMetaById[slide.identityUserId];
		const name = slide.displayName || slide.username || "User";
		return (
			<div className="flex items-center gap-3">
				<MusicImage src={meta?.avatarUrl} alt={name} type="circle" size="medium" className="w-10 h-10" />
				<Link href={`/user/${slide.identityUserId}`} className="text-white font-medium hover:underline">
					{name}
				</Link>
			</div>
		);
	};

		const Card = ({ children }: { children: React.ReactNode }) => (
		<div className="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-4 shadow-md w-full max-w-2xl">
			{children}
		</div>
	);

	// Component to show friend reactions at the top of each post
	const FriendReactions = ({ slide }: { slide: Slide }) => {
		const slideKey = keyOf(slide);
		const reactions = reactionsBySlide[slideKey] || [];
		
		if (reactions.length === 0) {
			return null; // Don't show anything if no reactions
		}

		return (
			<div className="mb-3 pb-3 border-b border-gray-800">
				<div className="flex flex-wrap gap-2 items-center">
					<span className="text-gray-400 text-xs mr-2">Friends reacted:</span>
					{reactions.map((reaction, idx) => (
						<div key={`${reaction.emoji}-${idx}`} 
							 className="flex items-center gap-1 bg-gray-800/50 rounded-full px-2 py-1 text-sm">
							<span className="text-base">{reaction.emoji}</span>
							<span className="text-gray-300 text-xs">{reaction.fromUserName || 'Friend'}</span>
							{reaction.count && reaction.count > 1 && (
								<span className="text-gray-400 text-xs">×{reaction.count}</span>
							)}
						</div>
					))}
				</div>
			</div>
		);
	};

	const ReactionBar = ({ slide, index }: { slide: Slide; index: number }) => {
		const flash = reactionFlash[index];
		const slideKey = keyOf(slide);
		const existingReactions = reactionsBySlide[slideKey] || [];
		
		return (
			<div className="pointer-events-none fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 items-center z-20">
				{/* Reaction buttons */}
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
			</div>
		);
	};

	const RecentSongCard = ({ slide }: { slide: Extract<Slide, { type: "recent_song" }> }) => (
		<Card>
			<FriendReactions slide={slide} />
			<div className="flex items-start gap-4">
				<div className="flex-1">
					<UserHeader slide={slide} />
					<div className="mt-4 flex items-center gap-4">
						<button
							className="w-28 h-28 rounded-xl overflow-hidden bg-white/5 flex-shrink-0"
							onClick={() => songsById[slide.songId] && playSong(songsById[slide.songId]!)}
							title="Play"
						>
							<MusicImage src={songsById[slide.songId]?.coverUrl || slide.coverUrl} alt={slide.songTitle || "Song"} size="large" className="w-full h-full" />
						</button>
						<div className="min-w-0">
							<div className="text-white text-xl font-semibold truncate">{slide.songTitle}</div>
							<div className="text-gray-300 truncate">
								{songsById[slide.songId]?.artists?.length
									? songsById[slide.songId]!.artists.map((a, i) => (
										<Link key={a.id || `${a.name}-${i}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
											{a.name}{i < (songsById[slide.songId]?.artists?.length || 0) - 1 ? ', ' : ''}
										</Link>
									))
									: slide.artist}
							</div>
							{songsById[slide.songId]?.album?.id && (
								<Link href={`/album/${songsById[slide.songId]!.album!.id}`} className="text-purple-300 text-sm hover:underline">View album</Link>
							)}
							{slide.playedAt && (
								<div className="text-gray-400 text-xs mt-1">{new Date(slide.playedAt).toLocaleString()}</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</Card>
	);

	const TopArtistsCard = ({ slide }: { slide: Extract<Slide, { type: "top_artists_week" }> }) => (
		<Card>
			<FriendReactions slide={slide} />
			<div className="flex items-center justify-between">
				<UserHeader slide={slide} />
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
		</Card>
	);

	const TopSongsCard = ({ slide }: { slide: Extract<Slide, { type: "top_songs_week" }> }) => (
		<Card>
			<FriendReactions slide={slide} />
			<div className="flex items-center justify-between">
				<UserHeader slide={slide} />
				<div className="text-white/60 text-xs">Top songs this week</div>
			</div>
			<div className="mt-4 grid grid-cols-1 gap-3">
				{slide.topSongs.slice(0, 5).map((ts, i) => {
					const song = ts.songId ? songsById[ts.songId] : null;
					const title = song?.title || ts.songTitle || "Unknown Song";
					const artistName = song?.artists?.map((a) => a.name).join(", ") || ts.artist || "Unknown Artist";
					return (
						<div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
							{song?.album?.id ? (
								<Link href={`/album/${song.album.id}`} className="w-12 h-12 rounded-lg overflow-hidden">
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
									{song?.artists?.length
										? song.artists.map((a, j) => (
											<Link key={a.id || `${a.name}-${j}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
												{a.name}{j < (song?.artists?.length || 0) - 1 ? ', ' : ''}
											</Link>
										))
										: artistName}
									<span className="text-gray-500"> • {ts.count} plays</span>
								</div>
							</div>
							<button onClick={(e) => { e.stopPropagation(); if (song) playSong(song); }} className="px-3 py-1 text-sm rounded-lg bg-white/10 hover:bg-white/20">
								Play
							</button>
						</div>
					);
				})}
			</div>
		</Card>
	);

	const CommonArtistsCard = ({ slide }: { slide: Extract<Slide, { type: "common_artists" }> }) => (
		<Card>
			<FriendReactions slide={slide} />
			<div className="flex items-center justify-between">
				<UserHeader slide={slide} />
				<div className="text-white/60 text-xs">You both listen to</div>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-2">
				{slide.commonArtists.slice(0, 8).map((name, i) => (
					<div key={i} className="bg-white/5 rounded-xl p-3 text-white text-sm truncate">
						{name}
					</div>
				))}
			</div>
		</Card>
	);

	if (!me) {
		return (
			<AppLayout>
				<div className="min-h-[60vh] flex items-center justify-center">
					<div className="text-gray-300">Please log in to see your feed.</div>
				</div>
			</AppLayout>
		);
	}

	console.log(`[Feed Debug] Render state - isLoading: ${isLoading}, slides.length: ${slides.length}, error: ${error}`);

	return (
		<AppLayout>
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
									{slide.type === "recent_song" && <RecentSongCard slide={slide} />}
									{slide.type === "top_artists_week" && <TopArtistsCard slide={slide} />}
									{slide.type === "top_songs_week" && <TopSongsCard slide={slide} />}
									{slide.type === "common_artists" && <CommonArtistsCard slide={slide} />}

									{/* Right-side reactions anchored to page edge for this section */}
									<ReactionBar slide={slide} index={idx} />
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
										You’re all caught up. No more posts for now.
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
		</AppLayout>
	);
}

export default function FeedPage() {
	return (
		<Suspense
			fallback={
				<AppLayout>
					<div className="px-4 pt-8 max-w-2xl mx-auto">
						<div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-gray-300">
							Loading feed...
						</div>
					</div>
				</AppLayout>
			}
		>
			<FeedInner />
		</Suspense>
	);
}



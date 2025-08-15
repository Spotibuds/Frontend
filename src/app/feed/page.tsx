"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import MusicImage from "@/components/ui/MusicImage";
import { identityApi, musicApi, userApi, type Song, type Artist } from "@/lib/api";
import { useAudio } from "@/lib/audio";

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

export default function FeedPage() {
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
	const loadSeen = () => {
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
	};
	const saveSeen = () => {
		try {
			if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, JSON.stringify(seenMapRef.current));
		} catch {}
	};

	// Utility: slide author and key (for dedupe/seen)
	const authorOf = (s: Slide) => s.identityUserId;
	const keyOf = (s: Slide) => {
		const base = `${s.type}:${s.identityUserId}`;
		if (s.type === 'recent_song') return `${base}:song:${(s as any).songId}`;
		if (s.type === 'top_songs_week') {
			const names = (s as any).topSongs?.map((x: any) => (x.songId || x.songTitle || '') + ':' + (x.artist || '')).join('|') || '';
			return `${base}:top_songs:${names}`;
		}
		if (s.type === 'top_artists_week') {
			const names = (s as any).topArtists?.map((x: any) => (x.name || '').toLowerCase()).join('|') || '';
			return `${base}:top_artists:${names}`;
		}
		if (s.type === 'common_artists') {
			const withId = (s as any).withIdentityUserId || '';
			const names = (s as any).commonArtists?.slice(0, 8).map((x: any) => (x || '').toLowerCase()).join('|') || '';
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
	const chunkedShuffle = (arr: Slide[], seedStr: string, chunkSize = 4) => {
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
	};

	// De-clump by author within a batch and at the boundary with previous author
	const declumpAuthors = (batch: Slide[]) => {
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
	};

	const [songsById, setSongsById] = useState<Record<string, Song | null>>({});
	const [artists, setArtists] = useState<Artist[]>([]);
	const [userMetaById, setUserMetaById] = useState<Record<string, { avatarUrl?: string }>>({});

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
	}, [userMetaById]);

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
				const now = Date.now();
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
				await Promise.allSettled([preloadSongs(reordered), preloadUserMeta(reordered)]);
			} catch (e) {
				console.error("Failed to load slides:", e);
				setError("Failed to load feed");
			} finally {
				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[me, skip, preloadSongs, preloadUserMeta]
	);

	// keep a live ref of slides for deep-link fallback logic
	useEffect(() => { slidesRef.current = slides; }, [slides]);

	// initial load once
	useEffect(() => {
		loadSlides(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [me]);

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
			root.removeEventListener("wheel", onWheel as any);
			root.removeEventListener("touchstart", onTouchStart as any);
			root.removeEventListener("touchmove", onTouchMove as any);
		};
	}, [currentIndex, scrollLocked, touchStartY, scrollToIndex]);

	const handleReact = useCallback(
		async (target: Slide, emoji: string, index?: number) => {
			if (!me) return;
			try {
				const base = {
					toIdentityUserId: target.identityUserId,
					fromIdentityUserId: me.id,
					fromUserName: me.username,
					emoji,
				};
				if (target.type === "recent_song") {
					await userApi.sendReaction({
						...base,
						contextType: "recent_song",
						songId: target.songId,
						songTitle: target.songTitle,
						artist: target.artist,
					});
				} else if (target.type === "top_artists_week") {
					await userApi.sendReaction({ ...base, contextType: "top_artists_week" });
				} else if (target.type === "common_artists") {
					await userApi.sendReaction({ ...base, contextType: "common_artists" });
				} else if (target.type === "top_songs_week") {
					await userApi.sendReaction({ ...base, contextType: "top_songs_week" });
				}
				if (typeof index === 'number') {
					setReactionFlash(prev => ({ ...prev, [index]: { emoji, at: Date.now() } }));
					setTimeout(() => {
						setReactionFlash(prev => {
							const copy = { ...prev } as typeof prev;
							delete (copy as any)[index!];
							return copy;
						});
					}, 1200);
				}
			} catch (e) {
				console.error("Failed to send reaction:", e);
			}
		},
		[me]
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

	const ReactionBar = ({ slide, index }: { slide: Slide; index: number }) => {
			const flash = reactionFlash[index];
			return (
		<div className="pointer-events-none fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 items-center z-20">
					{["👍", "🔥", "😍", "😂", "👏", "😮"].map((em) => (
						<button
							key={em}
							onClick={(e) => { e.stopPropagation(); handleReact(slide, em, index); }}
							className={`pointer-events-auto w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-lg flex items-center justify-center transform-gpu transition-transform duration-150 active:scale-95 ${flash?.emoji === em ? 'ring-2 ring-purple-400 animate-pulse' : ''}`}
							style={{ willChange: 'transform' }}
							title={`React ${em}`}
						>
							{em}
						</button>
					))}
					{/* Sent chip removed per request */}
				</div>
			);
		};

	const RecentSongCard = ({ slide }: { slide: Extract<Slide, { type: "recent_song" }> }) => (
		<Card>
			<div className="flex items-start gap-4">
				<div className="flex-1">
					<UserHeader slide={slide} />
					<div className="mt-4 flex items-center gap-4">
						<button
							className="w-28 h-28 rounded-xl overflow-hidden bg-white/5 flex-shrink-0"
							onClick={() => songsById[slide.songId] && playSong(songsById[slide.songId] as any)}
							title="Play"
						>
							<MusicImage src={songsById[slide.songId]?.coverUrl || slide.coverUrl} alt={slide.songTitle || "Song"} size="large" className="w-full h-full" />
						</button>
						<div className="min-w-0">
							<div className="text-white text-xl font-semibold truncate">{slide.songTitle}</div>
							<div className="text-gray-300 truncate">
								{songsById[slide.songId]?.artists?.length
									? (songsById[slide.songId]!.artists as any[]).map((a: any, i: number) => (
										<Link key={a.id || `${a.name}-${i}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
											{a.name}{i < ((songsById[slide.songId] as any)?.artists?.length || 0) - 1 ? ', ' : ''}
										</Link>
									))
									: slide.artist}
							</div>
							{(songsById[slide.songId] as any)?.album?.id && (
								<Link href={`/album/${(songsById[slide.songId] as any).album.id}`} className="text-purple-300 text-sm hover:underline">View album</Link>
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
		</Card>
	);

	const CommonArtistsCard = ({ slide }: { slide: Extract<Slide, { type: "common_artists" }> }) => (
		<Card>
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



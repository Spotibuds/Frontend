"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import MusicImage from "@/components/ui/MusicImage";
import { userApi, identityApi, musicApi, type Song, type Artist } from "@/lib/api";
import { useAudio } from "@/lib/audio";

export default function SinglePostPage() {
	const params = useParams();
	const router = useRouter();
	const postId = params?.id as string;
	const [me] = useState(() => identityApi.getCurrentUser());
	const [post, setPost] = useState<any>(null);
	const [song, setSong] = useState<Song | null>(null);
	const [artists, setArtists] = useState<Artist[]>([]);
	const [topSongs, setTopSongs] = useState<Record<string, Song>>({});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reactions, setReactions] = useState<Array<{ emoji: string; fromIdentityUserId: string; fromUserName?: string; createdAt: string }>>([]);
	const [showReactionModal, setShowReactionModal] = useState(false);
	const { playSong } = useAudio();

	useEffect(() => {
		if (!postId || !me) return;

		const loadPost = async () => {
			try {
				setIsLoading(true);
				setError(null);

				// Get the post data
				const postData = await userApi.getPostById(postId, me.id);
				setPost(postData);

				// If it's a recent_song, try to get the full song data
				if (postData.type === "recent_song" && postData.songId) {
					try {
						const songData = await musicApi.getSong(postData.songId);
						setSong(songData);
					} catch (e) {
						console.warn("Failed to load song data:", e);
					}
				}

				// Load reactions for this post
				try {
					const reactionData = await userApi.getReactionsByPost(postId);
					setReactions(reactionData || []);
				} catch (e) {
					console.warn("Failed to load reactions:", e);
				}

				// Load artists for image display
				try {
					const allArtists = await musicApi.getArtists();
					setArtists(allArtists);
				} catch (e) {
					console.warn("Failed to load artists:", e);
				}

				// Load song details for top_songs_week posts
				if (postData.type === "top_songs_week" && postData.topSongs) {
					try {
						const songPromises = postData.topSongs
							.filter((ts: any) => ts.songId)
							.map((ts: any) => musicApi.getSong(ts.songId).catch(() => null));
						const songResults = await Promise.all(songPromises);
						const songMap: Record<string, Song> = {};
						songResults.forEach((songData, index) => {
							if (songData) {
								const originalSong = postData.topSongs.filter((ts: any) => ts.songId)[index];
								if (originalSong) {
									songMap[originalSong.songId] = songData;
								}
							}
						});
						setTopSongs(songMap);
					} catch (e) {
						console.warn("Failed to load top songs details:", e);
					}
				}
			} catch (e) {
				console.error("Failed to load post:", e);
				setError("Failed to load post");
			} finally {
				setIsLoading(false);
			}
		};

		loadPost();
	}, [postId, me]);



	const renderReactionCluster = () => {
		if (!reactions.length) return null;
		const counts = reactions.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {});
		const items = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,6);
		
		return (
			<div className="mt-4">
				<button className="flex -space-x-2" onClick={() => setShowReactionModal(true)} aria-label="View reactions">
					{items.map(([em, count]) => (
						<span key={em} className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-base">
							{em}
							<span className="absolute -bottom-1 -right-1 text-[10px] bg-purple-600 text-white rounded px-1">{count}</span>
						</span>
					))}
				</button>
			</div>
		);
	};

	const Card = ({ children }: { children: React.ReactNode }) => (
		<div className="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-md w-full max-w-2xl mx-auto">
			{children}
		</div>
	);

	if (!me) {
		return (
			<AppLayout>
				<div className="min-h-[60vh] flex items-center justify-center">
					<div className="text-gray-300">Please log in to view posts.</div>
				</div>
			</AppLayout>
		);
	}

	if (isLoading) {
		return (
			<AppLayout>
				<div className="px-4 pt-8 max-w-2xl mx-auto">
					<div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 animate-pulse">
						<div className="h-4 bg-gray-800 rounded w-1/3 mb-4"></div>
						<div className="h-28 bg-gray-800 rounded"></div>
					</div>
				</div>
			</AppLayout>
		);
	}

	if (error || !post) {
		return (
			<AppLayout>
				<div className="px-4 pt-8 max-w-2xl mx-auto text-center">
					<div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
						<div className="text-red-400 mb-4">{error || "Post not found"}</div>
						<button onClick={() => router.back()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
							Go Back
						</button>
					</div>
				</div>
			</AppLayout>
		);
	}

	return (
		<AppLayout>
			<div className="px-4 pt-8 max-w-4xl mx-auto">
				{/* Back button */}
				<div className="mb-6">
					<button onClick={() => router.back()} className="flex items-center text-gray-400 hover:text-white transition-colors">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
						</svg>
						Back
					</button>
				</div>

				{/* Post content */}
				{post.type === "recent_song" && (
					<Card>
						<div className="flex items-start gap-4">
							<div className="flex-1">
								{/* User header */}
								<div className="flex items-center gap-3 mb-4">
									<div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
										<span className="text-white font-bold text-sm">
											{(post.displayName || post.username || "U").charAt(0).toUpperCase()}
										</span>
									</div>
									<Link href={`/user/${post.identityUserId}`} className="text-white font-medium hover:underline">
										{post.displayName || post.username || "User"}
									</Link>
								</div>

								{/* Song content */}
								<div className="flex items-center gap-4">
									<button
										className="w-32 h-32 rounded-xl overflow-hidden bg-white/5 flex-shrink-0"
										onClick={() => song && playSong(song)}
										title="Play"
									>
										<MusicImage src={song?.coverUrl || post.coverUrl} alt={post.songTitle || "Song"} size="large" className="w-full h-full" />
									</button>
									<div className="min-w-0">
										<div className="text-white text-2xl font-semibold mb-1">{post.songTitle}</div>
										<div className="text-gray-300 text-lg mb-2">
											{song?.artists?.length
												? song.artists.map((a: any, i: number) => (
													<Link key={a.id || `${a.name}-${i}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
														{a.name}{i < (song.artists?.length || 0) - 1 ? ', ' : ''}
													</Link>
												))
												: post.artist}
										</div>
										{song?.album?.id && (
											<Link href={`/album/${song.album.id}`} className="text-purple-300 text-sm hover:underline">View album</Link>
										)}
										{post.playedAt && (
											<div className="text-gray-400 text-sm mt-2">Played on {new Date(post.playedAt).toLocaleDateString()}</div>
										)}
									</div>
								</div>

								{/* Reaction cluster */}
								{renderReactionCluster()}
							</div>
						</div>
					</Card>
				)}

				{post.type === "top_artists_week" && (
					<Card>
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
									<span className="text-white font-bold text-sm">
										{(post.displayName || post.username || "U").charAt(0).toUpperCase()}
									</span>
								</div>
								<Link href={`/user/${post.identityUserId}`} className="text-white font-medium hover:underline">
									{post.displayName || post.username || "User"}
								</Link>
							</div>
							<div className="text-white/60 text-sm">Top artists this week</div>
						</div>
						<div className="grid grid-cols-1 gap-3">
							{post.topArtists?.slice(0, 5).map((a: any, i: number) => {
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
											<div className="text-gray-300 text-sm">{a.count} plays</div>
										</div>
									</div>
								);
							})}
						</div>
						{renderReactionCluster()}
					</Card>
				)}

				{post.type === "top_songs_week" && (
					<Card>
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
									<span className="text-white font-bold text-sm">
										{(post.displayName || post.username || "U").charAt(0).toUpperCase()}
									</span>
								</div>
								<Link href={`/user/${post.identityUserId}`} className="text-white font-medium hover:underline">
									{post.displayName || post.username || "User"}
								</Link>
							</div>
							<div className="text-white/60 text-sm">Top songs this week</div>
						</div>
						<div className="grid grid-cols-1 gap-3">
							{post.topSongs?.slice(0, 5).map((ts: any, i: number) => {
								const songData = ts.songId ? topSongs[ts.songId] : null;
								const title = songData?.title || ts.songTitle || "Unknown Song";
								const artistName = songData?.artists?.map((a) => a.name).join(", ") || ts.artist || "Unknown Artist";
								return (
									<div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
										<div className="w-12 h-12 rounded-lg overflow-hidden">
											<MusicImage src={songData?.coverUrl} alt={title} size="medium" className="w-12 h-12" />
										</div>
										<div className="text-left flex-1 min-w-0">
											{songData?.album?.id ? (
												<Link href={`/album/${songData.album.id}`} className="text-white font-semibold truncate hover:underline">{title}</Link>
											) : (
												<div className="text-white font-semibold truncate">{title}</div>
											)}
											<div className="text-gray-300 text-sm truncate">
												{songData?.artists?.length
													? songData.artists.map((a: any, j: number) => (
														<Link key={a.id || `${a.name}-${j}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline">
															{a.name}{j < (songData.artists?.length || 0) - 1 ? ', ' : ''}
														</Link>
													))
													: artistName}
												<span className="text-gray-500"> • {ts.count} plays</span>
											</div>
										</div>
										<button 
											onClick={(e) => { e.stopPropagation(); if (songData) playSong(songData); }} 
											className="px-3 py-1 text-sm rounded-lg bg-white/10 hover:bg-white/20"
										>
											Play
										</button>
									</div>
								);
							})}
						</div>
						{renderReactionCluster()}
					</Card>
				)}

				{post.type === "common_artists" && (
					<Card>
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
									<span className="text-white font-bold text-sm">
										{(post.displayName || post.username || "U").charAt(0).toUpperCase()}
									</span>
								</div>
								<Link href={`/user/${post.identityUserId}`} className="text-white font-medium hover:underline">
									{post.displayName || post.username || "User"}
								</Link>
							</div>
							<div className="text-white/60 text-sm">Common artists</div>
						</div>
						<div className="grid grid-cols-1 gap-2">
							{post.commonArtists?.map((artist: string, i: number) => {
								const artistDetails = artists.find((ar) => ar.name.toLowerCase() === artist.toLowerCase());
								return (
									<div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
										<div className="w-10 h-10 rounded-lg overflow-hidden">
											<MusicImage src={artistDetails?.imageUrl} alt={artist} size="medium" className="w-10 h-10" />
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
						{renderReactionCluster()}
					</Card>
				)}

				{/* Reactions section - always show if there are reactions */}
				{reactions.length > 0 && (
					<div className="mt-6">
						{/* Compact reaction cluster */}
						<div className="mb-4">
							{renderReactionCluster()}
						</div>
						
						{/* Detailed reactions list */}
						<div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
							<h3 className="text-white font-semibold mb-3">Reactions ({reactions.length})</h3>
							<div className="space-y-2">
								{reactions.slice(0, 5).map((r, i) => (
									<div key={i} className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<span className="text-lg">{r.emoji}</span>
											<Link href={`/user/${r.fromIdentityUserId}`} className="text-purple-300 hover:underline">
												{r.fromUserName || 'User'}
											</Link>
										</div>
										<span className="text-gray-500 text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
									</div>
								))}
								{reactions.length > 5 && (
									<button 
										onClick={() => setShowReactionModal(true)}
										className="text-purple-400 hover:text-purple-300 text-sm mt-2"
									>
										View all {reactions.length} reactions
									</button>
								)}
							</div>
						</div>
					</div>
				)}

				{/* Reaction modal */}
				{showReactionModal && (
					<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowReactionModal(false)}>
						<div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
							<div className="flex items-center justify-between mb-4">
								<div className="text-white font-semibold text-lg">Reactions</div>
								<button className="text-gray-400 hover:text-white" onClick={() => setShowReactionModal(false)}>✕</button>
							</div>
							<div className="max-h-80 overflow-y-auto space-y-3">
								{reactions.map((r, i) => (
									<div key={i} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
										<div className="flex items-center gap-3">
											<span className="text-xl">{r.emoji}</span>
											<Link href={`/user/${r.fromIdentityUserId}`} className="text-purple-300 hover:underline">
												{r.fromUserName || 'User'}
											</Link>
										</div>
										<span className="text-gray-500 text-xs">{new Date(r.createdAt).toLocaleString()}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</div>
		</AppLayout>
	);
}

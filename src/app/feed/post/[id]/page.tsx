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
	const [userProfile, setUserProfile] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reactions, setReactions] = useState<Array<{ emoji: string; fromIdentityUserId: string; fromUserName?: string; createdAt: string }>>([]);
	const [showReactionModal, setShowReactionModal] = useState(false);
	const { playSong } = useAudio();

	// Enhanced user display component
	const UserHeader = ({ post, userProfile }: { post: any; userProfile?: any }) => {
		const displayName = userProfile?.displayName || post.displayName || userProfile?.username || post.username || "User";
		const username = userProfile?.username || post.username;
		const avatarUrl = userProfile?.avatarUrl;
		
		return (
			<div className="flex items-center gap-3 mb-4">
				<div className="relative">
					{avatarUrl ? (
						<img 
							src={avatarUrl} 
							alt={displayName}
							className="w-12 h-12 rounded-full object-cover"
						/>
					) : (
						<div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
							<span className="text-white font-bold text-lg">
								{displayName.charAt(0).toUpperCase()}
							</span>
						</div>
					)}
				</div>
				<div className="flex flex-col">
					<Link href={`/user/${post.identityUserId}`} className="text-white font-semibold hover:underline">
						{displayName}
					</Link>
					{username && username !== displayName && (
						<div className="text-gray-400 text-sm">@{username}</div>
					)}
				</div>
			</div>
		);
	};

	// Enhanced reaction cluster with better UI
	const ReactionCluster = () => {
		if (!reactions.length) {
			return (
				<div className="flex items-center gap-2 text-gray-400 text-sm">
					<span>💬</span>
					<span>No reactions yet</span>
				</div>
			);
		}

		const counts = reactions.reduce<Record<string, number>>((acc, r) => {
			acc[r.emoji] = (acc[r.emoji] || 0) + 1;
			return acc;
		}, {});
		
		const items = Object.entries(counts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6);

		return (
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex -space-x-1">
					{items.map(([emoji, count]) => (
						<div
							key={emoji}
							className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-800/60 border-2 border-gray-700 text-lg hover:scale-110 transition-transform cursor-pointer"
							onClick={() => setShowReactionModal(true)}
							title={`${count} ${emoji} reaction${count > 1 ? 's' : ''}`}
						>
							{emoji}
							<span className="absolute -bottom-1 -right-1 text-[10px] bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
								{count}
							</span>
						</div>
					))}
				</div>
				<button
					onClick={() => setShowReactionModal(true)}
					className="text-gray-400 hover:text-white text-sm transition-colors"
				>
					{reactions.length} reaction{reactions.length !== 1 ? 's' : ''}
				</button>
			</div>
		);
	};

	useEffect(() => {
		if (!postId || !me) return;

		const loadPost = async () => {
			try {
				setIsLoading(true);
				setError(null);

				// Get the post data
				const postData = await userApi.getPostById(postId, me.id);
				setPost(postData);

				// Load user profile for better display
				if (postData.identityUserId) {
					try {
						const profile = await userApi.getUserProfileByIdentityId(postData.identityUserId);
						setUserProfile(profile);
					} catch (e) {
						console.warn("Failed to load user profile:", e);
					}
				}

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
					const reactionData = await userApi.getReactionsByPost(postId, me.id);
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



	// Enhanced Card component with gradient border
	const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
		<div className={`relative bg-gradient-to-br from-gray-900/80 to-gray-800/60 border border-gray-700/50 rounded-2xl p-6 shadow-lg backdrop-blur-sm w-full max-w-3xl mx-auto ${className}`}>
			<div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-2xl pointer-events-none"></div>
			<div className="relative z-10">
				{children}
			</div>
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
						<div className="space-y-6">
							{/* User header */}
							<UserHeader post={post} userProfile={userProfile} />

							{/* Song display */}
							<div className="flex flex-col lg:flex-row items-center gap-6 bg-white/5 rounded-xl p-4">
								{/* Album art */}
								<button
									className="w-40 h-40 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex-shrink-0 hover:scale-105 transition-transform group"
									onClick={() => song && playSong(song)}
									title="Play song"
								>
									<div className="relative w-full h-full">
										<MusicImage 
											src={song?.coverUrl || post.coverUrl} 
											alt={post.songTitle || "Song"} 
											size="large" 
											className="w-full h-full object-cover" 
										/>
										<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
											<div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
												<svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
													<path d="M8 5v14l11-7z"/>
												</svg>
											</div>
										</div>
									</div>
								</button>

								{/* Song info */}
								<div className="flex-1 text-center lg:text-left">
									<h1 className="text-white text-3xl font-bold mb-2">{post.songTitle}</h1>
									<div className="text-gray-300 text-xl mb-3">
										{song?.artists?.length
											? song.artists.map((a: any, i: number) => (
												<Link key={a.id || `${a.name}-${i}`} href={a.id ? `/artist/${a.id}` : '#'} className="hover:underline hover:text-purple-300 transition-colors">
													{a.name}{i < (song.artists?.length || 0) - 1 ? ', ' : ''}
												</Link>
											))
											: <span className="hover:text-purple-300 transition-colors">{post.artist}</span>}
									</div>
									
									{/* Additional info */}
									<div className="flex flex-col gap-2">
										{song?.album?.id && (
											<Link href={`/album/${song.album.id}`} className="text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1">
												<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
												</svg>
												View Album
											</Link>
										)}
										{post.playedAt && (
											<div className="text-gray-400 text-sm flex items-center gap-1">
												<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
												</svg>
												Played on {new Date(post.playedAt).toLocaleDateString()}
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Reactions */}
							<div className="border-t border-gray-700/50 pt-4">
								<ReactionCluster />
							</div>
						</div>
					</Card>
				)}

				{post.type === "top_artists_week" && (
					<Card>
						<div className="space-y-6">
							{/* User header */}
							<div className="flex items-center justify-between">
								<UserHeader post={post} userProfile={userProfile} />
								<div className="text-purple-300 text-sm font-medium bg-purple-500/20 px-3 py-1 rounded-full">
									Top Artists This Week
								</div>
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

						{/* Reactions */}
						<div className="border-t border-gray-700/50 pt-4">
							<ReactionCluster />
						</div>
						</div>
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
						<ReactionCluster />
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
						<ReactionCluster />
					</Card>
				)}



				{/* Enhanced Reaction Modal */}
				{showReactionModal && (
					<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReactionModal(false)}>
						<div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
							{/* Header */}
							<div className="flex items-center justify-between p-6 border-b border-gray-700/50">
								<div className="flex items-center gap-3">
									<div className="text-white font-semibold text-lg">Reactions</div>
									<div className="bg-purple-600/20 text-purple-300 px-2 py-1 rounded-full text-sm font-medium">
										{reactions.length}
									</div>
								</div>
								<button 
									className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
									onClick={() => setShowReactionModal(false)}
								>
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
							
							{/* Reactions List */}
							<div className="max-h-96 overflow-y-auto p-4">
								<div className="space-y-3">
									{reactions.map((r, i) => (
										<div key={i} className="flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-colors">
											<div className="flex items-center gap-3">
												<div className="text-2xl">{r.emoji}</div>
												<div className="flex flex-col">
													<Link 
														href={`/user/${r.fromIdentityUserId}`} 
														className="text-white font-medium hover:text-purple-300 transition-colors"
														onClick={() => setShowReactionModal(false)}
													>
														{r.fromUserName || 'User'}
													</Link>
													<div className="text-gray-400 text-xs">
														{new Date(r.createdAt).toLocaleString()}
													</div>
												</div>
											</div>
										</div>
									))}
								</div>
								
								{reactions.length === 0 && (
									<div className="text-center py-8 text-gray-400">
										<div className="text-4xl mb-2">😊</div>
										<div>No reactions yet</div>
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		</AppLayout>
	);
}

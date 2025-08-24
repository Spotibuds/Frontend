"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import MusicImage from "@/components/ui/MusicImage";
import { identityApi, userApi, musicApi } from "@/lib/api";
import { useAudio } from "@/lib/audio";

type PostReaction = {
  toIdentityUserId: string;
  fromIdentityUserId: string;
  fromUserName?: string;
  emoji: string;
  createdAt: string;
  contextType?: string;
  songId?: string;
  songTitle?: string;
  artist?: string;
  postId?: string;
};

interface PostData {
  id: string;
  type: string;
  identityUserId: string;
  username?: string;
  displayName?: string;
  songId?: string;
  songTitle?: string;
  artist?: string;
  coverUrl?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params?.id as string;
  const { playSong } = useAudio();

  const [currentUser] = useState<{ id: string; username: string } | null>(
    identityApi.getCurrentUser()
  );
  const [reactions, setReactions] = useState<PostReaction[]>([]);
  const [postData, setPostData] = useState<PostData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReaction, setIsLoadingReaction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enhanced post loading with rich context
  useEffect(() => {
    const load = async () => {
      if (!postId) return;
      try {
        setIsLoading(true);
        setError(null);
        
        // Load reactions and try to derive post context
        const [reactionsData] = await Promise.allSettled([
          userApi.getReactionsByPost(postId, currentUser?.id)
        ]);
        
        const reactions = reactionsData.status === 'fulfilled' && Array.isArray(reactionsData.value) 
          ? reactionsData.value 
          : [];
        setReactions(reactions);
        
        // Derive post context from reactions or postId structure
        if (reactions.length > 0) {
          const firstReaction = reactions[0];
          const inferredPostData: PostData = {
            id: postId,
            type: firstReaction.contextType || 'unknown',
            identityUserId: firstReaction.toIdentityUserId,
            songId: firstReaction.songId,
            songTitle: firstReaction.songTitle,
            artist: firstReaction.artist,
            createdAt: firstReaction.createdAt
          };
          setPostData(inferredPostData);
        } else {
          // Try to parse postId for context (format: type:userId:extra)
          const parts = postId.split(':');
          if (parts.length >= 2) {
            setPostData({
              id: postId,
              type: parts[0],
              identityUserId: parts[1],
              songId: parts.length > 3 ? parts[3] : undefined
            });
          }
        }
      } catch {
        setError("Failed to load post data");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [postId, currentUser?.id]);

  const emojiCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reactions) {
      map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }, [reactions]);

  // Handle reactions on post page
  const handleReact = useCallback(async (emoji: string) => {
    if (!currentUser || !postData) return;
    
    setIsLoadingReaction(true);
    try {
      // Optimistic update
      const hasExisting = reactions.some(r => r.emoji === emoji && r.fromIdentityUserId === currentUser.id);
      const optimisticReactions = hasExisting
        ? reactions.filter(r => !(r.emoji === emoji && r.fromIdentityUserId === currentUser.id))
        : [...reactions, {
            emoji,
            fromIdentityUserId: currentUser.id,
            fromUserName: currentUser.username,
            toIdentityUserId: postData.identityUserId,
            createdAt: new Date().toISOString(),
            contextType: postData.type,
            songId: postData.songId,
            songTitle: postData.songTitle,
            artist: postData.artist,
            postId: postId
          }];
      
      setReactions(optimisticReactions);
      
      // Send to server
      await userApi.sendReaction({
        toIdentityUserId: postData.identityUserId,
        fromIdentityUserId: currentUser.id,
        fromUserName: currentUser.username,
        emoji,
        contextType: postData.type,
        songId: postData.songId,
        songTitle: postData.songTitle,
        artist: postData.artist,
        postId: postId
      });
    } catch (error) {
      console.error('Failed to send reaction:', error);
      // Revert optimistic update on error
      const data = await userApi.getReactionsByPost(postId, currentUser?.id);
      setReactions(Array.isArray(data) ? data : []);
    } finally {
      setIsLoadingReaction(false);
    }
  }, [currentUser, postData, reactions, postId]);

  const feedHref = useMemo(() => {
    // Enhanced deep-link construction
    if (postData) {
      const search = new URLSearchParams({
        focusType: postData.type,
        to: postData.identityUserId,
      });
      if (postData.songId) {
        search.set('songId', postData.songId);
      }
      return `/feed?${search.toString()}`;
    }
    
    // Fallback for reactions
    const r = reactions.find((x) =>
      (x.contextType === "recent_song" || !x.contextType) && x.songId
    );
    if (r && r.songId && r.toIdentityUserId) {
      const search = new URLSearchParams({
        focusType: "recent_song",
        to: r.toIdentityUserId,
        songId: r.songId,
      });
      return `/feed?${search.toString()}`;
    }
    return "/feed";
  }, [postData, reactions]);

  return (
    <AppLayout>
      <div className="px-4 pt-8 max-w-2xl mx-auto">
        {/* Enhanced Navigation */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <span>←</span> Back
          </button>
          <div className="flex items-center gap-3">
            <Link 
              href={feedHref} 
              className="text-sm text-purple-300 hover:text-purple-200 transition-colors"
            >
              Open in Feed
            </Link>
            <div className="text-gray-500 text-xs truncate">#{postId.slice(-8)}</div>
          </div>
        </div>

        <div className="space-y-6">
          {isLoading ? (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
              <div className="animate-pulse space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-800 rounded-full"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-800 rounded w-1/3"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/4"></div>
                  </div>
                </div>
                <div className="h-20 bg-gray-800 rounded"></div>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-800 rounded-2xl p-6 text-center">
              <div className="text-red-400 mb-2">{error}</div>
              <button 
                onClick={() => window.location.reload()} 
                className="text-sm text-red-300 hover:text-red-200 underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Enhanced Post Content */}
              {postData && (
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                  {/* Post Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <MusicImage 
                      src={`/api/placeholder/40/40`}
                      alt={postData.displayName || postData.username || 'User'} 
                      type="circle" 
                      size="medium" 
                      className="w-12 h-12" 
                    />
                    <div className="flex-1">
                      <Link 
                        href={`/user/${postData.identityUserId}`}
                        className="text-white font-medium hover:underline"
                      >
                        {postData.displayName || postData.username || 'Unknown User'}
                      </Link>
                      <div className="text-gray-400 text-sm capitalize">
                        {postData.type?.replace('_', ' ')} 
                        {postData.createdAt && (
                          <span className="ml-2">• {new Date(postData.createdAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Song Content (if applicable) */}
                  {postData.songId && (
                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                          <MusicImage 
                            src={postData.coverUrl}
                            alt={postData.songTitle || 'Song'} 
                            size="large" 
                            className="w-full h-full" 
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">
                            {postData.songTitle || 'Unknown Song'}
                          </div>
                          <div className="text-gray-300 text-sm truncate">
                            {postData.artist || 'Unknown Artist'}
                          </div>
                          <button
                            onClick={async () => {
                              if (postData.songId) {
                                try {
                                  const song = await musicApi.getSong(postData.songId);
                                  if (song) playSong(song);
                                } catch (e) {
                                  console.warn('Could not play song:', e);
                                }
                              }
                            }}
                            className="mt-2 text-xs text-purple-300 hover:text-purple-200 flex items-center gap-1"
                          >
                            ▶ Play Song
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Enhanced Reactions Section */}
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white text-lg font-semibold">
                    Reactions ({reactions.length})
                  </h2>
                  {currentUser && postData && (
                    <div className="text-xs text-gray-400">
                      Click emoji to react
                    </div>
                  )}
                </div>

                {/* Reaction Summary */}
                <div className="mb-6">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {emojiCounts.length > 0 ? (
                      emojiCounts.map((e) => (
                        <span
                          key={e.emoji}
                          className="px-3 py-2 rounded-full bg-white/10 text-white font-medium"
                        >
                          {e.emoji} <span className="text-gray-400">{e.count}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500 text-sm">No reactions yet</span>
                    )}
                  </div>

                  {/* React Buttons */}
                  {currentUser && postData && (
                    <div className="flex gap-2 p-3 bg-white/5 rounded-xl">
                      {['👍', '❤️', '😂', '😮', '🔥', '👏'].map((emoji) => {
                        const hasReacted = reactions.some(r => r.emoji === emoji && r.fromIdentityUserId === currentUser.id);
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReact(emoji)}
                            disabled={isLoadingReaction}
                            className={`w-10 h-10 rounded-full text-lg transition-all duration-200 ${
                              hasReacted 
                                ? 'bg-purple-600/50 hover:bg-purple-600/70' 
                                : 'bg-white/10 hover:bg-white/20'
                            } disabled:opacity-50`}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reaction List */}
                <div className="space-y-3">
                  {reactions.map((r, idx) => (
                    <div
                      key={idx}
                      className="bg-white/5 rounded-xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl select-none">{r.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-white">
                            <Link
                              href={`/user/${r.fromIdentityUserId}`}
                              className="text-purple-300 hover:text-purple-200 font-medium"
                            >
                              {r.fromUserName || "Unknown"}
                            </Link>
                            {r.songTitle && (
                              <span className="text-gray-400 ml-1">
                                reacted to {r.songTitle}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(r.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}




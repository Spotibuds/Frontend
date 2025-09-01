interface CachedReaction {
  emoji: string;
  fromIdentityUserId: string;
  fromUserName?: string;
  toIdentityUserId: string;
  createdAt: string;
  contextType?: string;
  songId?: string;
  songTitle?: string;
  artist?: string;
  postId?: string;
}

interface CacheEntry {
  data: CachedReaction[];
  timestamp: number;
  ttl: number;
}

class ReactionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes
  private readonly maxSize = 100;

  // Get reactions from cache
  get(key: string): CachedReaction[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  // Set reactions in cache
  set(key: string, reactions: CachedReaction[], ttl?: number): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data: reactions,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  // Optimistic update - add or remove a reaction immediately
  optimisticUpdate(
    key: string,
    userId: string,
    emoji: string,
    action: 'add' | 'remove',
    reactionData?: Partial<CachedReaction>
  ): CachedReaction[] | null {
    const current = this.get(key);
    if (!current) return null;

    const updated = [...current];
    const existingIndex = updated.findIndex(
      r => r.fromIdentityUserId === userId && r.emoji === emoji
    );

    if (action === 'add' && existingIndex === -1) {
      // Add new reaction
      updated.push({
        emoji,
        fromIdentityUserId: userId,
        fromUserName: reactionData?.fromUserName || 'User',
        toIdentityUserId: reactionData?.toIdentityUserId || '',
        createdAt: new Date().toISOString(),
        ...reactionData,
      });
    } else if (action === 'remove' && existingIndex !== -1) {
      // Remove existing reaction
      updated.splice(existingIndex, 1);
    }

    // Update cache with new data
    this.set(key, updated);
    return updated;
  }

  // Invalidate a specific cache entry
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Create a singleton instance
export const reactionCache = new ReactionCache();

// Utility functions for generating cache keys
export const getCacheKey = {
  slide: (slideKey: string) => `slide:${slideKey}`,
  post: (postId: string) => `post:${postId}`,
  user: (userId: string) => `user:${userId}`,
};

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => reactionCache.cleanup(), 5 * 60 * 1000);
}

export type { CachedReaction };

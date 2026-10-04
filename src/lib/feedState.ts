import type { FeedSlide } from "./feedTypes";

// The server identifier distinguishes weeks and viewer-specific comparisons.
export function feedSlideKey(slide: FeedSlide) {
  return slide.postId || `${slide.type}:${slide.identityUserId}`;
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const objectId = /^[0-9a-f]{24}$/i;
export function isFeedSlide(value: unknown): value is FeedSlide {
  if (!value || typeof value !== "object") return false;
  const slide = value as Record<string, unknown>;
  if (
    typeof slide.postId !== "string" ||
    !slide.postId ||
    slide.postId.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(slide.postId) ||
    typeof slide.identityUserId !== "string" ||
    !guid.test(slide.identityUserId)
  )
    return false;
  const list = (items: unknown, valid: (item: Record<string, unknown>) => boolean) =>
    Array.isArray(items) && items.every(item => item && typeof item === "object" && valid(item));
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  switch (slide.type) {
    case "recent_song":
    case "now_playing":
      return typeof slide.songId === "string" && objectId.test(slide.songId);
    case "top_artists_week":
      return list(slide.topArtists, item => typeof item.name === "string" && count(item.count));
    case "top_songs_week":
      return list(
        slide.topSongs,
        item =>
          count(item.count) &&
          (item.songId === undefined ||
            (typeof item.songId === "string" && objectId.test(item.songId)))
      );
    case "common_artists":
      return (
        typeof slide.withIdentityUserId === "string" &&
        guid.test(slide.withIdentityUserId) &&
        Array.isArray(slide.commonArtists) &&
        slide.commonArtists.every(name => typeof name === "string")
      );
    default:
      return false;
  }
}

type Slide = FeedSlide;
const authorOf = (slide: Slide) => slide.identityUserId;
// PRNG and chunked shuffle
const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
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
export function chunkedShuffle(arr: Slide[], seedStr: string, chunkSize = 4) {
  if (arr.length <= 1) return arr.slice();
  const out: Slide[] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    const rng = mulberry32(hashString(seedStr + ":" + i));
    // Fisher-Yates
    for (let j = chunk.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [chunk[j], chunk[k]] = [chunk[k], chunk[j]];
    }
    out.push(...chunk);
  }
  return out;
}

// De-clump by author within a batch and at the boundary with previous author
export function declumpAuthors(batch: Slide[], lastAuthor: string | null) {
  if (batch.length <= 1) return batch;
  const res = batch.slice();
  // boundary check
  if (lastAuthor && authorOf(res[0]) === lastAuthor) {
    const idx = res.findIndex(s => authorOf(s) !== lastAuthor);
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
  return res;
}

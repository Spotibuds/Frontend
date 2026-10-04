"use client";
import { HeartIcon } from "@heroicons/react/24/outline";
import { useFavorites } from "@/contexts/FavoritesContext";
export default function FavoriteButton({ songId, title }: { songId: string; title: string }) {
  const favorites = useFavorites();
  const liked = favorites.ids.has(songId);
  return (
    <button
      type="button"
      className="icon-button shrink-0"
      aria-pressed={liked}
      aria-label={`${liked ? "Remove" : "Save"} ${title} ${liked ? "from" : "to"} Liked Songs`}
      title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      disabled={favorites.loading || favorites.pending.has(songId)}
      onClick={event => {
        event.stopPropagation();
        void favorites.toggle(songId).catch(() => {});
      }}
    >
      {favorites.pending.has(songId) ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
      ) : (
        <HeartIcon className={`h-5 w-5 ${liked ? "fill-purple-400 text-purple-400" : ""}`} />
      )}
    </button>
  );
}

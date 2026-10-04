import Link from "next/link";
import type { Song } from "@/lib/api";

export default function ArtistLinks({
  artists,
  fallback = "",
  onNavigate,
}: {
  artists?: Song["artists"];
  fallback?: string;
  onNavigate?: () => void;
}) {
  if (!artists?.length) return <>{fallback}</>;
  return artists.map((artist, index) => (
    <span key={artist.id || `${artist.name}-${index}`}>
      {index > 0 && ", "}
      {artist.id ? (
        <Link href={`/artist/${artist.id}`} onClick={onNavigate} className="hover:underline">
          {artist.name}
        </Link>
      ) : (
        artist.name
      )}
    </span>
  ));
}

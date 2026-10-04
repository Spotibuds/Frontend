"use client";
import { useRef, useState } from "react";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import Link from "next/link";
import { PlayIcon, MusicalNoteIcon } from "@heroicons/react/24/outline";
import { musicApi, identityApi, type Album, type Artist, type Song } from "@/lib/api";
import MusicImage from "@/components/ui/MusicImage";
import SongCard from "@/components/SongCard";
import AlbumPlayButton from "@/components/ui/AlbumPlayButton";
import { useFavorites } from "@/contexts/FavoritesContext";
import { Button } from "@/components/ui/Button";

type Category = "songs" | "albums" | "artists";
const emptyPages = () => ({ songs: false, albums: false, artists: false });
const appendUnique = <T extends { id: string }>(existing: T[], next: T[]) => {
  const ids = new Set(existing.map(item => item.id));
  return [...existing, ...next.filter(item => !ids.has(item.id) && Boolean(ids.add(item.id)))];
};

export default function MusicDiscovery({ home = false }: { home?: boolean }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("All");
  const [hasMore, setHasMore] = useState(emptyPages);
  const [loadingMore, setLoadingMore] = useState<Category | null>(null);
  const [pageError, setPageError] = useState<{ category: Category; message: string } | null>(null);
  const paging = useRef({ version: 0, busy: false, offsets: { songs: 0, albums: 0, artists: 0 } });
  const favorites = useFavorites();
  const user = identityApi.getCurrentUser();
  useDeferredEffect(() => {
    let active = true;
    const lifecycle = paging.current;
    const version = ++lifecycle.version;
    lifecycle.busy = false;
    setLoadingMore(null);
    setPageError(null);
    setHasMore(emptyPages());
    void (async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        musicApi.getSongs(home ? 12 : 50),
        musicApi.getAlbums(home ? 12 : 50),
        musicApi.getArtists(home ? 8 : 50),
      ]);
      if (!active) return;
      const unavailable: string[] = [];
      if (results[0].status === "fulfilled") setSongs(results[0].value);
      else unavailable.push("Songs");
      if (results[1].status === "fulfilled") setAlbums(results[1].value);
      else unavailable.push("Albums");
      if (results[2].status === "fulfilled") setArtists(results[2].value);
      else unavailable.push("Artists");
      const lengths = results.map(result =>
        result.status === "fulfilled" ? result.value.length : 0
      );
      paging.current.offsets = { songs: lengths[0], albums: lengths[1], artists: lengths[2] };
      setHasMore({
        songs: !home && lengths[0] === 50,
        albums: !home && lengths[1] === 50,
        artists: !home && lengths[2] === 50,
      });
      setErrors(unavailable);
      setLoading(false);
    })();
    return () => {
      active = false;
      if (lifecycle.version === version) lifecycle.version++;
    };
  }, [home, retry]);
  const loadMore = async (category: Category) => {
    if (paging.current.busy || loading || home || !hasMore[category]) return;
    const version = paging.current.version;
    paging.current.busy = true;
    setLoadingMore(category);
    setPageError(null);
    try {
      const offset = paging.current.offsets[category];
      let count = 0;
      if (category === "songs") {
        const page = await musicApi.getSongs(50, offset);
        if (version !== paging.current.version) return;
        count = page.length;
        setSongs(previous => appendUnique(previous, page));
      } else if (category === "albums") {
        const page = await musicApi.getAlbums(50, offset);
        if (version !== paging.current.version) return;
        count = page.length;
        setAlbums(previous => appendUnique(previous, page));
      } else {
        const page = await musicApi.getArtists(50, offset);
        if (version !== paging.current.version) return;
        count = page.length;
        setArtists(previous => appendUnique(previous, page));
      }
      paging.current.offsets[category] += count;
      setHasMore(previous => ({ ...previous, [category]: count === 50 }));
    } catch {
      if (version === paging.current.version)
        setPageError({ category, message: `More ${category} could not be loaded. Retry.` });
    } finally {
      if (version === paging.current.version) {
        paging.current.busy = false;
        setLoadingMore(null);
      }
    }
  };
  const more = (category: Category) =>
    !home &&
    hasMore[category] && (
      <div className="mt-4">
        {pageError?.category === category && (
          <p role="alert" className="mb-3 text-sm text-red-300">
            {pageError.message}
          </p>
        )}
        <Button
          variant="secondary"
          loading={loadingMore === category}
          disabled={loadingMore !== null}
          onClick={() => void loadMore(category)}
        >
          Load more {category}
        </Button>
      </div>
    );
  const hour = new Date().getHours();
  return (
    <div className="page-shell">
      <div className="page-heading flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1>
            {home
              ? `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${user ? `, ${user.displayName || user.username}` : ""}`
              : "Discover music"}
          </h1>
          <p>
            {home
              ? "Pick something you love. Find something new."
              : "Albums, artists, and songs. Start wherever you like."}
          </p>
        </div>
        {home && (
          <Link
            href="/playlists"
            className="rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-medium hover:bg-gray-800"
          >
            Your library
          </Link>
        )}
      </div>
      {home && favorites.playlistId && (
        <Link
          href={`/playlists/${favorites.playlistId}`}
          className="mb-8 flex w-fit items-center gap-4 rounded-xl bg-gray-800 px-5 py-4 hover:bg-gray-700"
        >
          <MusicalNoteIcon className="h-6 w-6 text-purple-400" />
          <span>
            <span className="block text-sm font-semibold">Your Liked Songs</span>
            <span className="text-xs text-gray-400">{favorites.ids.size} saved songs</span>
          </span>
          <PlayIcon className="ml-5 h-5 w-5" />
        </Link>
      )}
      {!home && (
        <div className="mb-8 flex flex-wrap gap-2" aria-label="Music categories">
          {["All", "Albums", "Artists", "Songs"].map(name => (
            <button
              type="button"
              key={name}
              aria-pressed={tab === name}
              onClick={() => setTab(name)}
              className={`rounded-lg px-4 py-2.5 text-sm ${tab === name ? "bg-gray-100 text-gray-950" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {errors.length > 0 && (
        <p role="alert" className="mb-6 rounded-lg bg-red-950 p-3 text-sm text-red-200">
          {errors.join(", ")} could not be loaded.{" "}
          <button onClick={() => setRetry(value => value + 1)} className="underline">
            Retry
          </button>
        </p>
      )}
      {loading && (
        <div role="status" className="py-10">
          <p className="mb-5 text-sm text-gray-400">Loading music…</p>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-square rounded-xl bg-gray-800" />
            ))}
          </div>
        </div>
      )}
      <div className="space-y-10">
        {(tab === "All" || tab === "Albums") && albums.length > 0 && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Albums to explore</h2>
              {home && (
                <Link href="/music" className="text-sm text-gray-400 hover:text-white">
                  Browse music
                </Link>
              )}
            </div>
            <div
              className={`grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 ${home ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
            >
              {(home ? albums.slice(0, 5) : albums).map(album => (
                <article key={album.id} className="min-w-0">
                  <div className="relative">
                    <Link
                      href={`/album/${album.id}`}
                      className="block aspect-square overflow-hidden rounded-xl bg-gray-800"
                      aria-label={`Open ${album.title}`}
                    >
                      <MusicImage
                        src={album.coverUrl}
                        alt={album.title}
                        size="large"
                        className="h-full w-full object-cover"
                      />
                    </Link>
                    <div className="absolute bottom-2 right-2">
                      <AlbumPlayButton album={album} size="small" />
                    </div>
                  </div>
                  <Link
                    href={`/album/${album.id}`}
                    className="mt-3 block truncate text-sm font-semibold hover:underline"
                  >
                    {album.title}
                  </Link>
                  <p className="mt-1 truncate text-xs text-gray-400">
                    {album.artist?.name || "Unknown artist"}
                  </p>
                </article>
              ))}
            </div>
            {more("albums")}
          </section>
        )}
        {(tab === "All" || tab === "Songs") && songs.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold">
              {home ? "Something to listen to" : "Songs"}
            </h2>
            <div>
              {(home ? songs.slice(0, 8) : songs).map((song, index) => (
                <SongCard key={song.id} song={song} index={index} />
              ))}
            </div>
            {more("songs")}
          </section>
        )}
        {(tab === "All" || tab === "Artists") && artists.length > 0 && (
          <section>
            <h2 className="mb-5 text-xl font-semibold">Artists</h2>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 xl:grid-cols-6">
              {artists.map(artist => (
                <Link
                  key={artist.id}
                  href={`/artist/${artist.id}`}
                  className="min-w-0 rounded-xl p-2 hover:bg-gray-800"
                >
                  <MusicImage
                    src={artist.imageUrl}
                    alt={artist.name}
                    size="large"
                    type="circle"
                    className="mx-auto aspect-square h-auto w-full max-w-[140px]"
                  />
                  <span className="mt-3 block truncate text-center text-sm font-medium">
                    {artist.name}
                  </span>
                </Link>
              ))}
            </div>
            {more("artists")}
          </section>
        )}
      </div>
      {!loading && !errors.length && !songs.length && !albums.length && !artists.length && (
        <div className="py-12">
          <h2 className="text-xl font-semibold">The catalogue is quiet for now</h2>
          <p className="mt-2 text-sm text-gray-400">Music will appear here when it’s added.</p>
        </div>
      )}
      {!loading &&
        !errors.length &&
        ((tab === "Albums" && !albums.length) ||
          (tab === "Artists" && !artists.length) ||
          (tab === "Songs" && !songs.length)) && (
          <p className="py-10 text-gray-400">No {tab.toLowerCase()} in the catalogue yet.</p>
        )}
    </div>
  );
}

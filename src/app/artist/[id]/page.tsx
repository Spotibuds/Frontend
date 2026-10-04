"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MusicImage from "@/components/ui/MusicImage";
import SongCard from "@/components/SongCard";
import AlbumPlayButton from "@/components/ui/AlbumPlayButton";
import { musicApi, safeString, type Artist, type Album, type Song } from "@/lib/api";
import MusicalNoteIcon from "@heroicons/react/24/outline/MusicalNoteIcon";
import Square3Stack3DIcon from "@heroicons/react/24/outline/Square3Stack3DIcon";
import PageLoading from "@/components/ui/PageLoading";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

export default function ArtistPage() {
  const params = useParams();
  const artistId = params.id as string;
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [partialError, setPartialError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useDeferredEffect(() => {
    let active = true;
    const abort = new AbortController();
    const fetchArtistData = async () => {
      if (!artistId) return;

      try {
        setLoading(true);
        setDetailsLoading(true);
        setArtist(null);
        setError(null);
        setPartialError("");
        setAlbums([]);
        setSongs([]);
        let artistData: Artist | null = null;

        const details = Promise.allSettled([
          musicApi.getArtistAlbums(artistId, 100, abort.signal),
          musicApi.getArtistSongs(artistId, 100, abort.signal),
        ]);
        try {
          artistData = await musicApi.getArtist(artistId, abort.signal);
        } catch {
          if (active && !abort.signal.aborted)
            setError("Artist could not be loaded. Please retry.");
          abort.abort();
          return;
        }
        if (!active) return;

        if (!artistData) {
          console.warn("Artist not found:", artistId);
          setError("Artist not found");
          return;
        }

        setArtist(artistData);
        setLoading(false);

        // Use the new efficient endpoints for artist-specific data
        const [albumsResult, songsResult] = await details;
        if (!active) return;

        if (albumsResult.status === "fulfilled") {
          setAlbums(albumsResult.value);
        } else {
          console.warn("Failed to load artist albums:", albumsResult.reason);
        }

        setPartialError(
          [albumsResult, songsResult].some(result => result.status === "rejected")
            ? "Some albums or songs could not be loaded. Retry."
            : ""
        );
        if (songsResult.status === "fulfilled") {
          setSongs(songsResult.value);
        } else {
          console.warn("Failed to load artist songs:", songsResult.reason);
        }
      } catch (error) {
        console.error("Error fetching artist data:", error);
        if (active) setError("Artist details could not be loaded. Please retry.");
      } finally {
        if (active) {
          setLoading(false);
          setDetailsLoading(false);
        }
      }
    };

    void fetchArtistData();
    return () => {
      active = false;
      abort.abort();
    };
  }, [artistId, retry]);

  if (loading) {
    return <PageLoading label="Loading artist…" />;
  }

  if (error || !artist) {
    return (
      <>
        <div className="p-6 flex items-center justify-center min-h-96">
          <div className="text-center">
            <p role="alert" className="text-red-400 mb-4">
              {error || "Artist not found"}
            </p>
            <button
              onClick={() => setRetry(value => value + 1)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
            >
              Retry artist
            </button>
            <Link
              href="/music"
              className="ml-4 inline-flex min-h-11 items-center text-gray-300 hover:underline"
            >
              Browse music
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Artist Hero Section */}
        <div className="relative bg-gray-800">
          <div className="max-w-7xl mx-auto px-6 pt-8 pb-12">
            <div className="flex flex-col lg:flex-row items-start lg:items-end gap-8">
              {/* Artist Image */}
              <div className="flex-shrink-0">
                <MusicImage
                  src={artist.imageUrl}
                  alt={safeString(artist.name)}
                  fallbackText={safeString(artist.name)}
                  size="xl"
                  type="circle"
                  className="shadow-2xl w-40 h-40 sm:w-52 sm:h-52 mx-auto lg:mx-0"
                  priority={true}
                  lazy={false}
                />
              </div>

              {/* Artist Info */}
              <div className="min-w-0 flex-1 text-left">
                <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 break-words">
                  {safeString(artist.name)}
                </h1>

                {/* Stats */}
                <div className="mb-6 flex flex-wrap items-center gap-4 text-gray-300">
                  <span className="flex items-center space-x-2">
                    <MusicalNoteIcon className="w-5 h-5" />
                    <span>
                      {detailsLoading
                        ? "Loading songs…"
                        : `${songs.length} song${songs.length !== 1 ? "s" : ""}`}
                    </span>
                  </span>
                  <span className="flex items-center space-x-2">
                    <Square3Stack3DIcon className="w-5 h-5" />
                    <span>
                      {detailsLoading
                        ? "Loading albums…"
                        : `${albums.length} album${albums.length !== 1 ? "s" : ""}`}
                    </span>
                  </span>
                </div>

                {/* Bio */}
                {artist.bio && (
                  <p className="text-gray-300 text-lg max-w-2xl leading-relaxed">
                    {safeString(artist.bio)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {partialError && (
          <p role="alert" className="px-6 text-red-300">
            {partialError}{" "}
            <button
              className="min-h-11 px-2 underline"
              onClick={() => setRetry(value => value + 1)}
            >
              Retry details
            </button>
          </p>
        )}
        {/* Content Sections */}
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
          {detailsLoading && <PageLoading label="Loading albums and songs…" />}
          {/* Songs */}
          {songs.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold text-white mb-6">Songs</h2>
              <div className="space-y-2">
                {songs.map((song, index) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    index={index}
                    showDuration={true}
                    showAddToPlaylist={true}
                    showAddToQueue={true}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {albums.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold text-white mb-6">Albums</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {albums.map(album => (
                  <div key={album.id} className="group min-w-0">
                    <Link
                      href={`/album/${album.id}`}
                      className="mb-3 block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-300"
                    >
                      <MusicImage
                        src={album.coverUrl}
                        alt={safeString(album.title)}
                        fallbackText={safeString(album.title)}
                        size="large"
                        type="square"
                        className="w-full"
                      />
                    </Link>
                    <Link href={`/album/${album.id}`} className="block hover:underline">
                      <h3 className="text-white font-semibold text-sm mb-1 truncate group-hover:underline">
                        {safeString(album.title)}
                      </h3>
                      <p className="text-gray-400 text-xs truncate">
                        {album.releaseDate ? new Date(album.releaseDate).getFullYear() : "Album"}
                      </p>
                    </Link>
                    <div className="mt-3">
                      <AlbumPlayButton album={album} size="small" showAddToQueue={true} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {!detailsLoading && !partialError && songs.length === 0 && albums.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-400 text-lg mb-2">No content available</p>
              <p className="text-gray-400">No songs or albums are available for this artist.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

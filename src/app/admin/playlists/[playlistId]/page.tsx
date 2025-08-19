"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "@/components/AdminNavigation";
import { adminApi, musicApi, type Song } from "@/lib/api";

export default function AddSongsToPlaylistPage() {
  const { playlistId } = useParams();
  const router = useRouter();
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playlistId) return;

    const fetchData = async () => {
      setLoading(true);
      const songsInPlaylist = await adminApi.getPlaylistSongs(playlistId[0]);
      setPlaylistSongs(songsInPlaylist);

      const all = await musicApi.getSongs();
      setAllSongs(all);

      setLoading(false);
    };

    fetchData();
  }, [playlistId]);

  const handleAddSong = async (songId: string) => {
    if (!playlistId) return;

    const success = await adminApi.addSongToPlaylist(playlistId[0], songId);
    if (success) {
      // Add to local state so button changes immediately
      const addedSong = allSongs.find((s) => s.id === songId);
      if (addedSong) setPlaylistSongs((prev) => [...prev, addedSong]);
    }
  };

  if (!playlistId) return <p>Invalid playlist.</p>;

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">
          Add Songs to Playlist
        </h1>

        {loading ? (
          <p>Loading songs...</p>
        ) : allSongs.length === 0 ? (
          <p>No songs available.</p>
        ) : (
          <table className="w-full border-collapse border border-purple-400">
            <thead className="bg-purple-700">
              <tr>
                <th className="border p-2">ID</th>
                <th className="border p-2">Title</th>
                <th className="border p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {allSongs.map((song) => {
                const inPlaylist = playlistSongs.some((s) => s.id === song.id);
                return (
                  <tr key={song.id} className="hover:bg-gray-900">
                    <td className="border p-2">{song.id}</td>
                    <td className="border p-2">{song.title}</td>
                    <td className="border p-2">
                      {inPlaylist ? (
                        <span className="text-gray-400">Added</span>
                      ) : (
                        <button
                          onClick={() => handleAddSong(song.id)}
                          className="bg-green-500 hover:bg-green-600 px-2 py-1 rounded"
                        >
                          Add
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="mt-4">
          <button
            onClick={() => router.back()}
            className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded"
          >
            Back
          </button>
        </div>
      </main>
    </AppLayout>
  );
}

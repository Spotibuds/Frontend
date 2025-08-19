"use client";

import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "../../../components/AdminNavigation";
import { adminApi, musicApi, type Playlist, type Song } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function AdminPagePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state for create/edit playlist
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [modalData, setModalData] = useState<{ id: string; name: string; description?: string }>({
    id: "",
    name: "",
    description: "",
  });

  const router = useRouter();
  // Modal for playlist songs
  const [songsModalOpen, setSongsModalOpen] = useState(false);
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string>("");

  const fetchPlaylists = async () => {
    setLoading(true);
    const data = await adminApi.getPlaylists();
    setPlaylists(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const openCreateModal = () => {
    setModalData({ id: "", name: "", description: "" });
    setIsEditing(false);
    setModalOpen(true);
  };

  const openEditModal = (playlist: Playlist) => {
    setModalData({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || "",
    });
    setIsEditing(true);
    setModalOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setModalData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!modalData.name) {
      alert("Name is required");
      return;
    }

    if (isEditing) {
      const updated = await musicApi.updatePlaylist(modalData.id, {
        Name: modalData.name,
        Description: modalData.description || "",
      });
      if (updated) {
        fetchPlaylists();
        setModalOpen(false);
      }
    } else {
      const created = await adminApi.createPlaylist(modalData.description || "", modalData.name);
      if (created) {
        fetchPlaylists();
        setModalOpen(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this playlist?")) return;
    const success = await adminApi.deletePlaylist(id);
    if (success) fetchPlaylists();
  };

  // Open songs modal
  const openSongsModal = async (playlistId: string) => {
    setCurrentPlaylistId(playlistId);
    const songs = await adminApi.getPlaylistSongs(playlistId);
    setPlaylistSongs(songs);
    setSongsModalOpen(true);
  };

  const handleRemoveSong = async (songId: string) => {
    if (!confirm("Remove this song from playlist?")) return;
    const success = await adminApi.removeSongFromPlaylist(currentPlaylistId, songId);
    if (success) {
      setPlaylistSongs((prev) => prev.filter((s) => s.id !== songId));
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6 bg-black min-h-screen text-white">
        <h1 className="text-3xl font-bold text-purple-400 mb-6">Playlists Dashboard</h1>

        <button
          onClick={openCreateModal}
          className="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded font-semibold mb-4"
        >
          Create Playlist
        </button>

        {loading ? (
          <p>Loading playlists...</p>
        ) : playlists.length === 0 ? (
          <p>No playlists found.</p>
        ) : (
          <table className="w-full border-collapse border border-purple-400">
            <thead className="bg-purple-700">
              <tr>
                <th className="border p-2">ID</th>
                <th className="border p-2">Name</th>
                <th className="border p-2">Description</th>
                <th className="border p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((p) => (
                <tr key={p.id} className="hover:bg-gray-900">
                  <td className="border p-2">{p.id}</td>
                  <td className="border p-2">{p.name}</td>
                  <td className="border p-2">{p.description}</td>
                  <td className="border p-2 flex gap-2">
                    <button
                      onClick={() => openEditModal(p)}
                      className="bg-purple-500 hover:bg-purple-600 px-2 py-1 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => router.push(`/admin/playlists/${p.id}`)}
                      className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded"
                    >
                      Add Songs
                    </button>
                    {/* NEW: Show Songs button */}
                    <button
                      onClick={() => openSongsModal(p.id)}
                      className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                    >
                      Songs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Playlist Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-purple-400 rounded p-6 w-96 text-white">
              <h2 className="text-xl font-bold mb-4 text-purple-400">
                {isEditing ? "Edit Playlist" : "Create Playlist"}
              </h2>
              <input
                name="name"
                className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                placeholder="Playlist Name"
                value={modalData.name}
                onChange={handleChange}
              />
              <textarea
                name="description"
                className="p-2 rounded border border-purple-400 w-full mb-3 bg-black text-white"
                placeholder="Description"
                value={modalData.description}
                onChange={handleChange}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="bg-purple-500 hover:bg-purple-600 px-3 py-1 rounded"
                >
                  {isEditing ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Songs Modal */}
        {songsModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-blue-400 rounded p-6 w-96 text-white max-h-[80vh] overflow-auto">
              <h2 className="text-xl font-bold mb-4 text-blue-400">Playlist Songs</h2>
              {playlistSongs.length === 0 ? (
                <p>No songs in this playlist.</p>
              ) : (
                <ul>
                  {playlistSongs.map((song) => (
                    <li
                      key={song.id}
                      className="flex justify-between items-center border-b border-blue-400 py-1"
                    >
                      <span>{song.title}</span>
                      <button
                        onClick={() => handleRemoveSong(song.id)}
                        className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setSongsModalOpen(false)}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}

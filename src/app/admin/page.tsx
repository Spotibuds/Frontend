"use client";

import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "../../components/AdminNavigation";
import MusicImage from "@/components/ui/MusicImage";
import { musicApi, adminApi, type Album, type Song, type Artist } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function AdminPageForAlbums() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songsMap, setSongsMap] = useState<Record<string, Song[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [artists, setArtists] = useState<Artist[]>([]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    id?: string;
    title: string;
    artistId: string;
    releaseDate: string;
    coverFile: File | null;
  }>({
    title: "",
    artistId: "",
    releaseDate: "",
    coverFile: null,
  });

  // Fetch albums + songs
  const fetchAlbums = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await musicApi.getAlbums();
      setAlbums(data);

      const songsPromises = data.map((album) =>
        musicApi
          .getAlbumSongs(album.id)
          .then((songs) => ({ id: album.id, songs }))
          .catch(() => ({ id: album.id, songs: [] }))
      );

      const songsResults = await Promise.all(songsPromises);
      const songsObj: Record<string, Song[]> = {};
      songsResults.forEach((res) => {
        songsObj[res.id] = res.songs;
      });
      setSongsMap(songsObj);
    } catch (err) {
      console.error(err);
      setError("Failed to load albums");
    } finally {
      setLoading(false);
    }
  };

  // Fetch artists
  const fetchArtists = async () => {
    try {
      const data = await musicApi.getArtists();
      setArtists(data);
    } catch (err) {
      console.error("Failed to load artists", err);
    }
  };

  useEffect(() => {
    fetchAlbums();
    fetchArtists();
  }, []);

  // Delete album
  const handleDelete = async (id: string) => {
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const success = await adminApi.deleteAlbum(id);
      if (success) {
        setAlbums((prev) => prev.filter((a) => a.id !== id));
        const newSongsMap = { ...songsMap };
        delete newSongsMap[id];
        setSongsMap(newSongsMap);
        MySwal.fire({ icon: "success", title: "Album deleted successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to delete album" });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  // Open modals
  const openCreateModal = () => {
    setModalData({ title: "", artistId: "", releaseDate: "", coverFile: null });
    setIsCreateModalOpen(true);
  };

  const openUpdateModal = (album: Album) => {
    setModalData({
      id: album.id,
      title: album.title,
      artistId: album.artist?.id || "",
      releaseDate: album.releaseDate ? album.releaseDate.split("T")[0] : "",
      coverFile: null,
    });
    setIsUpdateModalOpen(true);
  };

  // Modal input change
  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;
    if (name === "coverFile") {
      setModalData((prev) => ({ ...prev, coverFile: files?.[0] || null }));
    } else {
      setModalData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Create album
  const handleCreateSubmit = async () => {
    if (!modalData.title || !modalData.artistId) {
      MySwal.fire({ icon: "warning", title: "Title and Artist are required" });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("Title", modalData.title);
      formData.append("ArtistId", modalData.artistId);
      formData.append("ReleaseDate", modalData.releaseDate);
      if (modalData.coverFile) formData.append("CoverFile", modalData.coverFile);

      const newAlbum = await adminApi.createAlbum(formData);

      if (newAlbum) {
        setAlbums((prev) => [...prev, newAlbum]);
        setIsCreateModalOpen(false);
        MySwal.fire({ icon: "success", title: "Album created successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to create album" });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  // Update album
  const handleUpdateSubmit = async () => {
    if (!modalData.title || !modalData.artistId) {
      MySwal.fire({ icon: "warning", title: "Title and Artist are required" });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("Title", modalData.title);
      formData.append("ArtistId", modalData.artistId);
      formData.append("ReleaseDate", modalData.releaseDate);
      if (modalData.coverFile) formData.append("CoverFile", modalData.coverFile);

      const updatedAlbum = await adminApi.updateAlbum(modalData.id!, formData);

      if (updatedAlbum) {
        setAlbums((prev) => prev.map((a) => (a.id === modalData.id ? updatedAlbum : a)));
        setIsUpdateModalOpen(false);
        MySwal.fire({ icon: "success", title: "Album updated successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to update album" });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-purple-400">Album Dashboard</h1>
          <button
            onClick={openCreateModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
          >
            Create New Album
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading albums...</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : albums.length === 0 ? (
          <p className="text-gray-400">No albums found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map((album) => (
              <div
                key={album.id}
                className="flex items-center bg-gray-900 p-4 rounded shadow-md space-x-4"
              >
                <MusicImage
                  src={album.coverUrl}
                  alt={album.title}
                  fallbackText={album.title}
                  size="medium"
                  type="square"
                  className="rounded shadow-lg"
                />
                <div className="flex-1">
                  <p className="text-white font-semibold">{album.title}</p>
                  <p className="text-gray-400 text-sm">
                    {album.artist?.name ?? "Unknown Artist"} • {songsMap[album.id]?.length ?? 0} songs
                  </p>
                  <div className="mt-2 space-x-2">
                    <button
                      onClick={() => openUpdateModal(album)}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => handleDelete(album.id)}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex justify-center items-center z-50">
            <div className="bg-gray-900 p-6 rounded shadow-lg w-96">
              <h2 className="text-xl font-bold mb-4 text-white">Create New Album</h2>
              <input
                type="text"
                name="title"
                placeholder="Title"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.title}
                onChange={handleModalChange}
              />
              <select
                name="artistId"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.artistId}
                onChange={handleModalChange}
              >
                <option value="">Select Artist</option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                name="releaseDate"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.releaseDate}
                onChange={handleModalChange}
              />
              <input
                type="file"
                name="coverFile"
                accept="image/*"
                className="w-full mb-4"
                onChange={handleModalChange}
              />
              <div className="flex justify-end space-x-2">
                <button
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
                  onClick={handleCreateSubmit}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Update Modal */}
        {isUpdateModalOpen && (
          <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex justify-center items-center z-50">
            <div className="bg-gray-900 p-6 rounded shadow-lg w-96">
              <h2 className="text-xl font-bold mb-4 text-white">Update Album</h2>
              <input
                type="text"
                name="title"
                placeholder="Title"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.title}
                onChange={handleModalChange}
              />
              <select
                name="artistId"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.artistId}
                onChange={handleModalChange}
              >
                <option value="">Select Artist</option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                name="releaseDate"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.releaseDate}
                onChange={handleModalChange}
              />
              <input
                type="file"
                name="coverFile"
                accept="image/*"
                className="w-full mb-4"
                onChange={handleModalChange}
              />
              <div className="flex justify-end space-x-2">
                <button
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                  onClick={() => setIsUpdateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
                  onClick={handleUpdateSubmit}
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}

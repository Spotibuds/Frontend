"use client";

import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "../../../components/AdminNavigation";
import MusicImage from "@/components/ui/MusicImage";
import { musicApi, adminApi, type Song, type Artist, type Album } from "@/lib/api";

export default function AdminPageForSongss() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    id: string;
    title: string;
    artists: Array<{ id: string; name: string }>;
    genre?: string;
    durationSec: number;
    album?: { id: string; title: string };
    fileUrl?: string;
    snippetUrl?: string;
    coverUrl?: string;
    createdAt?: string;
    releaseDate?: string;
  }>({
    title: "",
    id: "",
    createdAt: "",
    coverUrl: undefined,
    artists: [],
    durationSec: 0,
  });

  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);

  // Fetch songs
  const fetchSongs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await musicApi.getSongs();
      setSongs(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load songs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // Delete song
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This cannot be undone.")) return;
    try {
      const success = await adminApi.deleteSong(id);
      if (success) {
        setSongs(songs.filter((a) => a.id !== id));
        alert("Song deleted successfully");
      } else {
        alert("Failed to delete song");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  // Open create modal
  const openCreateModal = async () => {
    setModalData({ title: "", id: "", createdAt: "", coverUrl: undefined, artists: [], durationSec: 0 });
    const fetchedArtists = await musicApi.getArtists();
    setArtists(fetchedArtists);
    setAlbums([]);
    setIsCreateModalOpen(true);
  };

  // Open update modal
  const openUpdateModal = async (song: Song) => {
    setModalData({
      id: song.id,
      title: song.title || "",
      genre: song.genre,
      releaseDate: song.releaseDate,
      coverUrl: song.coverUrl,
      snippetUrl: song.snippetUrl,
      artists: song.artists || [],
      album: song.album,
      durationSec: song.durationSec || 0,
    });
    const fetchedArtists = await musicApi.getArtists();
    setArtists(fetchedArtists);

    if (song.artists?.[0]?.id) {
      const fetchedAlbums = await musicApi.getArtistAlbums(song.artists[0].id);
      setAlbums(fetchedAlbums);
    }
    setIsUpdateModalOpen(true);
  };

  // Handle modal input change
  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
   const { name, value, files } = e.target as HTMLInputElement;

    if (name === "coverFile") {
    const fileNames = files ? Array.from(files).map((f) => f.name) : [];
    setModalData((prev) => ({ ...prev, coverUrl: fileNames.join(",") })); 
    } else if (name === "snippetFile") {
    const fileNames = files ? Array.from(files).map((f) => f.name) : [];
    setModalData((prev) => ({ ...prev, snippetUrl: fileNames.join(",") }));
    }
    else if (name === "artist") {
      setModalData((prev) => ({ ...prev, artists: [{ id: value, name: artists.find(a => a.id === value)?.name || "" }] }));
      // Fetch albums for selected artist
      fetchAlbumsForArtist(value);
    } else if (name === "album") {
      setModalData((prev) => ({ ...prev, album: { id: value, title: albums.find(a => a.id === value)?.title || "" } }));
    } else {
      setModalData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const fetchAlbumsForArtist = async (artistId: string) => {
    const artistAlbums = await musicApi.getArtistAlbums(artistId);
    setAlbums(artistAlbums);
    setModalData((prev) => ({ ...prev, album: undefined })); // reset album selection
  };

  // Submit create modal
  const handleCreateSubmit = async () => {
    if (!modalData.title || !modalData.artists[0]?.id || !modalData.album?.id || !modalData.snippetUrl) {
      alert("Please fill all required fields: Title, Artist, Album, Audio File");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("Title", modalData.title);
      formData.append("ArtistId", modalData.artists[0].id);
      formData.append("AlbumId", modalData.album.id);
      formData.append("Genre", modalData.genre || "");
      if (modalData.releaseDate) formData.append("ReleaseDate", modalData.releaseDate);
      if (modalData.coverUrl) formData.append("CoverFile", modalData.coverUrl);
      formData.append("SnippetFile", modalData.snippetUrl );

      const newSong = await adminApi.createSong(formData);
      if (newSong) {
        setSongs((prev) => [...prev, newSong]);
        setIsCreateModalOpen(false);
        alert("Song created successfully");
      } else {
        alert("Failed to create song");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  // Submit update modal
  const handleUpdateSubmit = async () => {
    if (!modalData.title || !modalData.artists[0]?.id || !modalData.album?.id) {
      alert("Please fill all required fields: Title, Artist, Album");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("Title", modalData.title);
      formData.append("ArtistId", modalData.artists[0].id);
      formData.append("AlbumId", modalData.album.id);
      formData.append("Genre", modalData.genre || "");
      if (modalData.releaseDate) formData.append("ReleaseDate", modalData.releaseDate);
      if (modalData.coverUrl) formData.append("CoverFile", modalData.coverUrl );
      if (modalData.snippetUrl) formData.append("SnippetFile", modalData.snippetUrl );

      const updatedSong = await adminApi.updateSong(modalData.id, formData);
      if (updatedSong) {
        setSongs((prev) =>
          prev.map((a) => (a.id === modalData.id ? { ...a, ...updatedSong } : a))
        );
        setIsUpdateModalOpen(false);
        alert("Song updated successfully");
      } else {
        alert("Failed to update song");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  return (
    <AppLayout>
      <SidebarNavigation />
      <main className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-purple-400">Song Dashboard</h1>
          <button
            onClick={openCreateModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
          >
            Create New Song
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading songs...</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : songs.length === 0 ? (
          <p className="text-gray-400">No songs found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {songs.map((song) => (
              <div
                key={song.id}
                className="flex items-center bg-gray-900 p-4 rounded shadow-md space-x-4"
              >
                <MusicImage
                  src={song.coverUrl}
                  alt={song.title}
                  fallbackText={song.title}
                  size="medium"
                  type="square"
                  className="rounded shadow-lg"
                />
                <div className="flex-1">
                  <p className="text-white font-semibold">{song.title}</p>
                  <p className="text-gray-400 text-sm">
                    {song.artists.map((a) => a.name).join(", ")} - {song.album?.title}
                  </p>
                  <div className="mt-2 space-x-2">
                    <button
                      onClick={() => openUpdateModal(song)}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => handleDelete(song.id)}
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
              <h2 className="text-xl font-bold mb-4 text-white">Create New Song</h2>
              <input
                type="text"
                name="title"
                placeholder="Title"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.title}
                onChange={handleModalChange}
              />
              <input
                type="text"
                name="genre"
                placeholder="Genre"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.genre || ""}
                onChange={handleModalChange}
              />
              <input
                type="date"
                name="releaseDate"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.releaseDate || ""}
                onChange={handleModalChange}
              />
              <select
                name="artist"
                value={modalData.artists[0]?.id || ""}
                onChange={handleModalChange}
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
              >
                <option value="">Select Artist</option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
              <select
                name="album"
                value={modalData.album?.id || ""}
                onChange={handleModalChange}
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
              >
                <option value="">Select Album</option>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))}
              </select>
              <input
                type="file"
                name="coverFile"
                accept="image/*"
                className="w-full mb-2"
                onChange={handleModalChange}
              />
              <input
                type="file"
                name="snippetFile"
                accept=".mp3,.wav,.flac,.m4a,.ogg"
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
              <h2 className="text-xl font-bold mb-4 text-white">Update Song</h2>
              <input
                type="text"
                name="title"
                placeholder="Title"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.title}
                onChange={handleModalChange}
              />
              <input
                type="text"
                name="genre"
                placeholder="Genre"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.genre || ""}
                onChange={handleModalChange}
              />
              <input
                type="date"
                name="releaseDate"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.releaseDate || ""}
                onChange={handleModalChange}
              />
              <select
                name="artist"
                value={modalData.artists[0]?.id || ""}
                onChange={handleModalChange}
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
              >
                <option value="">Select Artist</option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
              <select
                name="album"
                value={modalData.album?.id || ""}
                onChange={handleModalChange}
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
              >
                <option value="">Select Album</option>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))}
              </select>
              <input
                type="file"
                name="coverFile"
                accept="image/*"
                className="w-full mb-2"
                onChange={handleModalChange}
              />
              <input
                type="file"
                name="snippetFile"
                accept=".mp3,.wav,.flac,.m4a,.ogg"
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

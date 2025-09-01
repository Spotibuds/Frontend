"use client";

import React, { useEffect, useState } from "react";
import SidebarNavigation from "../../components/AdminNavigation";
import MusicImage from "@/components/ui/MusicImage";
import { musicApi, adminApi, type Album, type Song, type Artist } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Image from "next/image";

const MySwal = withReactContent(Swal);

export default function AdminPageForAlbums() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songsMap, setSongsMap] = useState<Record<string, Song[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [artists, setArtists] = useState<Artist[]>([]);

  // Search dropdown states
  const [artistSearch, setArtistSearch] = useState("");
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const albumsPerPage = 6;
  const totalPages = Math.ceil(albums.length / albumsPerPage);
  const indexOfLast = currentPage * albumsPerPage;
  const indexOfFirst = indexOfLast - albumsPerPage;
  const currentAlbums = albums.slice(indexOfFirst, indexOfLast);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

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



  // Filter artists dynamically
  useEffect(() => {
    if (artistSearch.trim() === "") {
      setFilteredArtists([]);
      return;
    }
    const results = artists.filter((a) =>
      a.name.toLowerCase().includes(artistSearch.toLowerCase())
    );
    setFilteredArtists(results);
  }, [artistSearch, artists]);

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
    setCoverPreview(null);
    setArtistSearch("");
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
    setCoverPreview(album.coverUrl || null);
    setArtistSearch("");
    setIsUpdateModalOpen(true);
  };

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;
    if (name === "coverFile") {
      const file = files?.[0] || null;
      setModalData((prev) => ({ ...prev, coverFile: file }));
      if (file) {
        setCoverPreview(URL.createObjectURL(file));
      }
    } else {
      setModalData((prev) => ({ ...prev, [name]: value }));
    }
  };

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
    <>
      <SidebarNavigation />
      <main className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3">
          <h1 className="text-2xl font-bold text-purple-400">Albums Dashboard</h1>
          <button
            onClick={openCreateModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded w-full sm:w-auto"
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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentAlbums.map((album) => (
                <div key={album.id} className="flex items-center bg-gray-900 p-4 rounded shadow-md space-x-4">
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

            {/* Pagination */}
            <div className="flex justify-center items-center mt-6 space-x-4 flex-wrap">
              <button
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-white">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Create & Update Modals */}
        {(isCreateModalOpen || isUpdateModalOpen) && (
          <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-900 p-6 rounded shadow-lg w-full max-w-sm">
              <h2 className="text-xl font-bold mb-4 text-white">
                {isCreateModalOpen ? "Create New Album" : "Update Album"}
              </h2>

              <input
                type="text"
                name="title"
                placeholder="Title"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.title}
                onChange={handleModalChange}
              />

              {/* Searchable Artist Dropdown */}
              <div className="relative mb-2">
                <input
                  type="text"
                  name="artistSearch"
                  placeholder="Search Artist"
                  className="w-full p-2 rounded bg-gray-800 text-white"
                  value={
                    modalData.artistId
                      ? artists.find((a) => a.id === modalData.artistId)?.name || ""
                      : artistSearch
                  }
                  onChange={(e) => {
                    setModalData((prev) => ({ ...prev, artistId: "" }));
                    setArtistSearch(e.target.value);
                    setShowArtistDropdown(true);
                  }}
                  onFocus={() => setShowArtistDropdown(true)}
                />

                {showArtistDropdown && filteredArtists.length > 0 && (
                  <ul className="absolute z-10 bg-gray-800 border border-gray-700 rounded w-full mt-1 max-h-40 overflow-y-auto">
                    {filteredArtists.map((artist) => (
                      <li
                        key={artist.id}
                        className="p-2 hover:bg-gray-700 cursor-pointer text-white"
                        onClick={() => {
                          setModalData((prev) => ({ ...prev, artistId: artist.id }));
                          setArtistSearch("");
                          setShowArtistDropdown(false);
                        }}
                      >
                        {artist.name}
                      </li>
                    ))}
                  </ul>
                )}

                {modalData.artistId === "" && (
                  <p className="text-red-400 text-xs mt-1">You must select an artist</p>
                )}
              </div>

              <label className="text-gray-400 text-sm mb-1">Release Date:</label>
              <input
                type="date"
                name="releaseDate"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.releaseDate}
                onChange={handleModalChange}
              />

              <label
                className="flex bg-gray-800 hover:bg-gray-700 text-white text-base font-medium px-4 py-2.5 outline-none rounded w-max cursor-pointer mx-auto"
              >
                Upload Cover
                <input
                  type="file"
                  name="coverFile"
                  accept="image/*"
                  className="hidden"
                  onChange={handleModalChange}
                />
              </label>

              {/* Cover Preview */}
              {coverPreview && (
                <div className="mt-3">
                  <p className="text-gray-400 text-sm mb-1">Cover Preview:</p>
                  <Image
                    src={coverPreview}
                    alt="Cover Preview"
                    width={128} 
                    height={128} 
                    className="object-cover rounded shadow-md mx-auto"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 mt-4">
                <button
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setIsUpdateModalOpen(false);
                    setCoverPreview(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={`${isCreateModalOpen ? "bg-purple-600 hover:bg-purple-700" : "bg-yellow-500 hover:bg-yellow-600"
                    } text-white px-4 py-2 rounded disabled:opacity-50`}
                  disabled={!modalData.artistId}
                  onClick={isCreateModalOpen ? handleCreateSubmit : handleUpdateSubmit}
                >
                  {isCreateModalOpen ? "Create" : "Update"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

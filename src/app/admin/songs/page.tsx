"use client";

import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import SidebarNavigation from "../../../components/AdminNavigation";
import MusicImage from "@/components/ui/MusicImage";
import { musicApi, adminApi, type Song, type Artist, type Album } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { blob } from "stream/consumers";

const MySwal = withReactContent(Swal);

export default function AdminPageForSongs() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [artistSearch, setArtistSearch] = useState("");
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);

  const [albumSearch, setAlbumSearch] = useState("");
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);

  const [genres, setGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState("");
  const [filteredGenres, setFilteredGenres] = useState<string[]>([]);
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

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
    coverFile?: File | null;
    audioFile?: File | null;
    createdAt?: string;
  }>({
    title: "",
    id: "",
    createdAt: "",
    artists: [],
    durationSec: 0,
  });

  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | undefined>();

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

  const isModalValid =
    modalData.title &&
    modalData.artists[0]?.id &&
    modalData.album?.id &&
    (isCreateModalOpen ? modalData.audioFile : true);

  useEffect(() => {
    fetchSongs();
  }, []);

  useEffect(() => {
    if (artistSearch.trim() === "") {
      setFilteredArtists([]);
      return;
    }
    setFilteredArtists(
      artists.filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()))
    );
  }, [artistSearch, artists]);

  useEffect(() => {
    if (albumSearch.trim() === "") {
      setFilteredAlbums([]);
      return;
    }
    setFilteredAlbums(
      albums.filter(a => a.title.toLowerCase().includes(albumSearch.toLowerCase()))
    );
  }, [albumSearch, albums]);

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/voltraco/genres/master/genres.json"
        );
        const data = await res.json();
        setGenres(data);
      } catch (err) {
        console.error("Failed to load genres", err);
      }
    };
    fetchGenres();
  }, []);

  useEffect(() => {
    if (genreSearch.trim() === "") {
      setFilteredGenres([]);
      return;
    }
    setFilteredGenres(
      genres.filter(g => g.toLowerCase().includes(genreSearch.toLowerCase()))
    );
  }, [genreSearch, genres]);

  // Pagination logic
  const indexOfLast = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentSongs = songs.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(songs.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Delete song
  const handleDelete = async (id: string) => {
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const success = await adminApi.deleteSong(id);
      if (success) {
        setSongs(songs.filter((a) => a.id !== id));
        MySwal.fire({ icon: "success", title: "Song deleted successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to delete song" });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  // Open create modal
  const openCreateModal = async () => {
    setModalData({
      title: "",
      id: "",
      createdAt: "",
      artists: [],
      durationSec: 0,
      coverFile: undefined,
      audioFile: undefined,
    });
    setCoverPreview(undefined);
    const fetchedArtists = await musicApi.getArtists();
    setArtists(fetchedArtists);
    setAlbums([]);
    setArtistSearch("");
    setAlbumSearch("");
    setIsCreateModalOpen(true);
  };

  // Open update modal
  const openUpdateModal = async (song: Song) => {
    setModalData({
      id: song.id,
      title: song.title || "",
      genre: song.genre,
      artists: song.artists || [],
      album: song.album,
      durationSec: song.durationSec || 0,
    });
    console.log(song.coverUrl);
    setCoverPreview(song.coverUrl);
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
      const file = files?.[0];
      setModalData((prev) => ({ ...prev, coverFile: file }));
      if (file) setCoverPreview(URL.createObjectURL(file));
    } else if (name === "audioFile") {
      const file = files?.[0];
      if (file) {
        setModalData((prev) => ({ ...prev, audioFile: file }));
        const audio = document.createElement("audio");
        audio.src = URL.createObjectURL(file);
        audio.addEventListener("loadedmetadata", () => {
          setModalData((prev) => ({ ...prev, durationSec: Math.round(audio.duration) }));
        });
      }
    } else if (name === "artist") {
      setModalData((prev) => ({
        ...prev,
        artists: [{ id: value, name: artists.find((a) => a.id === value)?.name || "" }],
      }));
      fetchAlbumsForArtist(value);
    } else if (name === "album") {
      setModalData((prev) => ({
        ...prev,
        album: { id: value, title: albums.find((a) => a.id === value)?.title || "" },
      }));
    } else {
      setModalData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const fetchAlbumsForArtist = async (artistId: string) => {
    const artistAlbums = await musicApi.getArtistAlbums(artistId);
    setAlbums(artistAlbums);
    setModalData((prev) => ({ ...prev, album: undefined }));
  };

  // Submit create modal
  const handleCreateSubmit = async () => {
    if (!modalData.title || !modalData.artists[0]?.id || !modalData.album?.id || !modalData.audioFile) {
      MySwal.fire({ icon: "warning", title: "Please fill all required fields: Title, Artist, Album, Audio File" });
      return;
    }
    if (!modalData.artists[0]?.id || !modalData.album?.id) {
      MySwal.fire({ icon: "warning", title: "Please select an artist and album" });
      return;
    }


    try {
      const formData = new FormData();
      formData.append("Title", modalData.title);
      formData.append("ArtistId", modalData.artists[0].id);
      formData.append("AlbumId", modalData.album.id);
      formData.append("Genre", modalData.genre || "");
      formData.append("Duration", modalData.durationSec.toString());
      if (modalData.coverFile) formData.append("CoverFile", modalData.coverFile);
      formData.append("AudioFile", modalData.audioFile!);

      const newSong = await adminApi.createSong(formData);
      if (newSong) {
        setSongs((prev) => [...prev, newSong]);
        setIsCreateModalOpen(false);
        MySwal.fire({ icon: "success", title: "Song created successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to create song" });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  // Submit update modal
  const handleUpdateSubmit = async () => {
    if (!modalData.title || !modalData.artists[0]?.id || !modalData.album?.id) {
      MySwal.fire({ icon: "warning", title: "Please fill all required fields: Title, Artist, Album" });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("Title", modalData.title);
      formData.append("ArtistId", modalData.artists[0].id);
      formData.append("AlbumId", modalData.album.id);
      formData.append("Genre", modalData.genre || "");
      formData.append("Duration", modalData.durationSec.toString());
      if (modalData.coverFile) formData.append("CoverFile", modalData.coverFile);
      if (modalData.audioFile) formData.append("AudioFile", modalData.audioFile);
      else formData.append("AudioFile", new Blob());

      const updatedSong = await adminApi.updateSong(modalData.id, formData);
      if (updatedSong) {
        setSongs((prev) => prev.map((a) => (a.id === modalData.id ? { ...a, ...updatedSong } : a)));
        setIsUpdateModalOpen(false);
        MySwal.fire({ icon: "success", title: "Song updated successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to update song" });
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
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3">
          <h1 className="text-2xl font-bold text-purple-400">Songs Dashboard</h1>
          <button
            onClick={openCreateModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded w-full sm:w-auto"
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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentSongs.map((song) => (
                <div
                  key={song.id}
                  className="flex flex-col sm:flex-row items-center bg-gray-900 p-4 rounded shadow-md space-y-3 sm:space-y-0 sm:space-x-4"
                >
                  <MusicImage
                    src={song.coverUrl}
                    alt={song.title}
                    fallbackText={song.title}
                    size="medium"
                    type="square"
                    className="rounded shadow-lg"
                  />
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-white font-semibold">{song.title}</p>
                    <p className="text-gray-400 text-sm">
                      {song.artists.map((a) => a.name).join(", ")} - {song.album?.title}
                    </p>
                    <p className="text-gray-400 text-sm">Duration: {song.durationSec}s</p>
                    <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-2">
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

            {/* Pagination */}
            <div className="flex justify-center items-center mt-6 space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-white">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Modal (same as your original, unchanged) */}
        {(isCreateModalOpen || isUpdateModalOpen) && (
          <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex justify-center items-center z-50">
            <div className="bg-gray-900 p-6 rounded shadow-lg w-96">
              <h2 className="text-xl font-bold mb-4 text-white">
                {isCreateModalOpen ? "Create New Song" : "Update Song"}
              </h2>

              {/* form inputs unchanged */}
              <input
                type="text"
                name="title"
                placeholder="Title"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.title}
                onChange={handleModalChange}
              />
              {/* Genre Search */}
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder="Search Genre"
                  value={modalData.genre || genreSearch}
                  onChange={(e) => {
                    setModalData({ ...modalData, genre: e.target.value });
                    setGenreSearch(e.target.value);
                    setShowGenreDropdown(true);
                  }}
                  onFocus={() => setShowGenreDropdown(true)}
                  className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                />
                {showGenreDropdown && filteredGenres.length > 0 && (
                  <ul className="absolute z-10 bg-gray-800 border border-gray-700 rounded w-full mt-1 max-h-40 overflow-y-auto">
                    {filteredGenres.map((g, idx) => (
                      <li
                        key={idx}
                        className="p-2 hover:bg-gray-700 cursor-pointer text-white"
                        onClick={() => {
                          setModalData({ ...modalData, genre: g });
                          setGenreSearch("");
                          setShowGenreDropdown(false);
                        }}
                      >
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Artist Search */}
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder="Search Artist"
                  value={modalData.artists[0]?.name || artistSearch}
                  onChange={(e) => {
                    setModalData({ ...modalData, artists: [{ id: "", name: e.target.value }] });
                    setArtistSearch(e.target.value);
                    setShowArtistDropdown(true);
                  }}
                  onFocus={() => setShowArtistDropdown(true)}
                  className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                />
                {showArtistDropdown && filteredArtists.length > 0 && (
                  <ul className="absolute z-10 bg-gray-800 border border-gray-700 rounded w-full mt-1 max-h-40 overflow-y-auto">
                    {filteredArtists.map(a => (
                      <li
                        key={a.id}
                        className="p-2 hover:bg-gray-700 cursor-pointer text-white"
                        onClick={() => {
                          setModalData({ ...modalData, artists: [{ id: a.id, name: a.name }] });
                          setArtistSearch("");
                          setShowArtistDropdown(false);
                          fetchAlbumsForArtist(a.id); // load albums for this artist
                          setAlbumSearch("");
                        }}
                      >
                        {a.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Album Search */}
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder="Search Album"
                  value={modalData.album?.title || albumSearch}
                  onChange={(e) => {
                    setModalData({ ...modalData, album: { id: "", title: e.target.value } });
                    setAlbumSearch(e.target.value);
                    setShowAlbumDropdown(true);
                  }}
                  onFocus={() => setShowAlbumDropdown(true)}
                  className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                />
                {showAlbumDropdown && filteredAlbums.length > 0 && (
                  <ul className="absolute z-10 bg-gray-800 border border-gray-700 rounded w-full mt-1 max-h-40 overflow-y-auto">
                    {filteredAlbums.map(alb => (
                      <li
                        key={alb.id}
                        className="p-2 hover:bg-gray-700 cursor-pointer text-white"
                        onClick={() => {
                          setModalData({ ...modalData, album: { id: alb.id, title: alb.title } });
                          setAlbumSearch("");
                          setShowAlbumDropdown(false);
                        }}
                      >
                        {alb.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="text-gray-400 text-sm mb-1">Cover Image:</label>
              <label
                className="flex bg-gray-800 hover:bg-gray-700 text-white text-base font-medium px-4 py-2.5 outline-none rounded w-max cursor-pointer mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 mr-2 fill-white inline" viewBox="0 0 32 32">
                  <path
                    d="M23.75 11.044a7.99 7.99 0 0 0-15.5-.009A8 8 0 0 0 9 27h3a1 1 0 0 0 0-2H9a6 6 0 0 1-.035-12 1.038 1.038 0 0 0 1.1-.854 5.991 5.991 0 0 1 11.862 0A1.08 1.08 0 0 0 23 13a6 6 0 0 1 0 12h-3a1 1 0 0 0 0 2h3a8 8 0 0 0 .75-15.956z"
                    data-original="#000000" />
                  <path
                    d="M20.293 19.707a1 1 0 0 0 1.414-1.414l-5-5a1 1 0 0 0-1.414 0l-5 5a1 1 0 0 0 1.414 1.414L15 16.414V29a1 1 0 0 0 2 0V16.414z"
                    data-original="#000000" />
                </svg>
                Upload Cover
                <input
                  type="file"
                  name="coverFile"
                  accept="image/*"
                  className="hidden"
                  onChange={handleModalChange}
                />

              </label>

              {coverPreview && (
                <img
                  src={coverPreview}
                  alt="cover preview"
                  className="w-24 h-24 object-cover mb-2 rounded"
                />
              )}

              <label className="text-gray-400 text-sm mb-1">Audio File:</label>
              <label
                className="flex bg-gray-800 hover:bg-gray-700 text-white text-base font-medium px-4 py-2.5 outline-none rounded w-max cursor-pointer mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 mr-2 fill-white inline" viewBox="0 0 32 32">
                  <path
                    d="M23.75 11.044a7.99 7.99 0 0 0-15.5-.009A8 8 0 0 0 9 27h3a1 1 0 0 0 0-2H9a6 6 0 0 1-.035-12 1.038 1.038 0 0 0 1.1-.854 5.991 5.991 0 0 1 11.862 0A1.08 1.08 0 0 0 23 13a6 6 0 0 1 0 12h-3a1 1 0 0 0 0 2h3a8 8 0 0 0 .75-15.956z"
                    data-original="#000000" />
                  <path
                    d="M20.293 19.707a1 1 0 0 0 1.414-1.414l-5-5a1 1 0 0 0-1.414 0l-5 5a1 1 0 0 0 1.414 1.414L15 16.414V29a1 1 0 0 0 2 0V16.414z"
                    data-original="#000000" />
                </svg>
                Upload Audio
                <input
                  type="file"
                  name="audioFile"
                  accept=".mp3,.wav,.flac,.m4a,.ogg"
                  className="hidden"
                  onChange={handleModalChange}
                />
              </label>
              {!modalData.audioFile && !isCreateModalOpen && (
                <p className="text-gray-400 mb-2">Audio file exists. Select a new file to replace it.</p>
              )}
              <p className="text-gray-400 mb-4">Duration: {modalData.durationSec}s</p>

              <div className="flex justify-end space-x-2">
                <button
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setIsUpdateModalOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={`${isCreateModalOpen
                    ? "bg-purple-600 hover:bg-purple-700"
                    : "bg-yellow-500 hover:bg-yellow-600"
                    } text-white px-4 py-2 rounded 
       disabled:bg-gray-500 disabled:cursor-not-allowed`}
                  onClick={isCreateModalOpen ? handleCreateSubmit : handleUpdateSubmit}
                  disabled={!isModalValid} // disables the button when modal is not valid
                >
                  {isCreateModalOpen ? "Create" : "Update"}
                </button>

              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}

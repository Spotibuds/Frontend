"use client";

import React, { useEffect, useState } from "react";
import SidebarNavigation from "../../../components/AdminNavigation";
import MusicImage from "@/components/ui/MusicImage";
import { musicApi, adminApi, type Artist, type Album } from "@/lib/api";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import Image from "next/image";

const MySwal = withReactContent(Swal);

export default function AdminPageForArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [albumsMap, setAlbumsMap] = useState<Record<string, Album[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    id: string;
    name: string;
    bio?: string;
    imageFile?: File;
    albums?: string[];
  }>({
    name: "",
    id: "",
  });

  const [imagePreview, setImagePreview] = useState<string | undefined>();

  const fetchArtists = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await musicApi.getArtists();
      setArtists(data);

      const albumsPromises = data.map((artist) =>
        musicApi
          .getArtistAlbums(artist.id)
          .then((albums) => ({ id: artist.id, albums }))
          .catch(() => ({ id: artist.id, albums: [] }))
      );

      const albumsResults = await Promise.all(albumsPromises);
      const albumsObj: Record<string, Album[]> = {};
      albumsResults.forEach((res) => {
        albumsObj[res.id] = res.albums;
      });
      setAlbumsMap(albumsObj);
    } catch (err) {
      console.error(err);
      setError("Failed to load albums");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtists();
  }, []);

  // Pagination logic
  const indexOfLast = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentArtists = artists.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(artists.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Delete artist
  const handleDelete = async (id: string) => {
    const result = await MySwal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      try {
        const success = await adminApi.deleteArtist(id);
        if (success) {
          setArtists(artists.filter((a) => a.id !== id));
          MySwal.fire({
            icon: "success",
            title: "Artist deleted successfully",
          });
        } else {
          MySwal.fire({
            icon: "error",
            title: "Failed to delete artist",
          });
        }
      } catch (err) {
        console.error(err);
        MySwal.fire({
          icon: "error",
          title: "Something went wrong",
        });
      }
    }
  };

  // Open modals
  const openCreateModal = () => {
    setModalData({ name: "", id: "" });
    setImagePreview(undefined);
    setIsCreateModalOpen(true);
  };

  const openUpdateModal = (artist: Artist) => {
    setModalData({
      id: artist.id,
      name: artist.name,
      bio: artist.bio || "",
    });
    setImagePreview(artist.imageUrl);
    setIsUpdateModalOpen(true);
  };

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;
    if (name === "imageFile") {
      const file = files?.[0];
      setModalData((prev) => ({ ...prev, imageFile: file }));
      if (file) setImagePreview(URL.createObjectURL(file));
    } else {
      setModalData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Submit create
  const handleCreateSubmit = async () => {
    if (!modalData.name) {
      MySwal.fire({ icon: "warning", title: "Name is required" });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("Name", modalData.name);
      if (modalData.bio) formData.append("Bio", modalData.bio);
      if (modalData.imageFile) formData.append("ImageFile", modalData.imageFile);

      const newArtist = await adminApi.createArtist(formData);
      if (newArtist) {
        setArtists((prev) => [...prev, newArtist]);
        setIsCreateModalOpen(false);
        MySwal.fire({ icon: "success", title: "Artist created successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to create artist" });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Something went wrong" });
    }
  };

  // Submit update
  const handleUpdateSubmit = async () => {
    if (!modalData.name) {
      MySwal.fire({ icon: "warning", title: "Name is required" });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("Name", modalData.name);
      if (modalData.bio) formData.append("Bio", modalData.bio);
      if (modalData.imageFile) formData.append("ImageFile", modalData.imageFile);

      const updatedArtist = await adminApi.updateArtist(modalData.id!, formData);
      if (updatedArtist) {
        setArtists((prev) =>
          prev.map((a) => (a.id === modalData.id ? { ...a, ...updatedArtist } : a))
        );
        setIsUpdateModalOpen(false);
        MySwal.fire({ icon: "success", title: "Artist updated successfully" });
      } else {
        MySwal.fire({ icon: "error", title: "Failed to update artist" });
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
          <h1 className="text-2xl font-bold text-purple-400">Artists Dashboard</h1>
          <button
            onClick={openCreateModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded w-full sm:w-auto"
          >
            Create New Artist
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading artists...</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : artists.length === 0 ? (
          <p className="text-gray-400">No artists found</p>
        ) : (
          <>
            {/* Artist grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentArtists.map((artist) => (
                <div
                  key={artist.id}
                  className="flex flex-col sm:flex-row items-center bg-gray-900 p-4 rounded shadow-md space-y-3 sm:space-y-0 sm:space-x-4"
                >
                  <MusicImage
                    src={artist.imageUrl}
                    alt={artist.name}
                    fallbackText={artist.name}
                    size="medium"
                    type="square"
                    className="rounded shadow-lg"
                  />
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-white font-semibold">{artist.name}</p>
                    <p className="text-gray-400 text-sm">
                      {albumsMap[artist.id]?.length ?? 0} albums
                    </p>
                    <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-2">
                      <button
                        onClick={() => openUpdateModal(artist)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => handleDelete(artist.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination controls */}
            <div className="flex justify-center items-center mt-6 gap-4 flex-wrap">
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

        {/* Modal */}
        {(isCreateModalOpen || isUpdateModalOpen) && (
          <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex justify-center items-center z-50">
            <div className="bg-gray-900 p-6 rounded shadow-lg w-96">
              <h2 className="text-xl font-bold mb-4 text-white">
                {isCreateModalOpen ? "Create New Artist" : "Update Artist"}
              </h2>
              <input
                type="text"
                name="name"
                placeholder="Name"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.name}
                onChange={handleModalChange}
              />
              <input
                type="text"
                name="bio"
                placeholder="BIO"
                className="w-full mb-2 p-2 rounded bg-gray-800 text-white"
                value={modalData.bio}
                onChange={handleModalChange}
              />
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
                Upload Image
                <input
                  type="file"
                  name="imageFile"
                  accept="image/*"
                  className="hidden"
                  onChange={handleModalChange}
                />
              </label>
              {imagePreview && (
                <Image
                  src={imagePreview}
                  alt="preview"
                  width={96} 
                  height={96} 
                  className="object-cover mb-2 rounded"
                />
              )}
              <div className="flex justify-end space-x-2 mt-4">
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
                    } text-white px-4 py-2 rounded`}
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

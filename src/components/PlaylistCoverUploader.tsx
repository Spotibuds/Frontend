"use client";

import { useState, useRef } from "react";
import { PhotoIcon, TrashIcon } from "@heroicons/react/24/outline";
import { musicApi } from "@/lib/api";
import MusicImage from "./ui/MusicImage";

interface PlaylistCoverUploaderProps {
  playlistId: string;
  currentCoverUrl?: string;
  onCoverUpdated?: (newCoverUrl: string | null) => void;
  className?: string;
}

export default function PlaylistCoverUploader({
  playlistId,
  currentCoverUrl,
  onCoverUpdated,
  className = "",
}: PlaylistCoverUploaderProps) {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Select a JPEG, PNG or WebP image");
      return;
    }

    // Validate file size (10MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    setError("");
    setUploading(true);
    try {
      const result = await musicApi.uploadPlaylistCover(playlistId, file);
      onCoverUpdated?.(result.coverUrl);
    } catch (error) {
      console.error("Error uploading cover:", error);
      setError(error instanceof Error ? error.message : "Failed to upload cover image");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteCover = async () => {
    if (!currentCoverUrl || uploading || deleting) return;

    setError("");

    setDeleting(true);
    try {
      await musicApi.deletePlaylistCover(playlistId);
      onCoverUpdated?.(null);
    } catch (error) {
      console.error("Error deleting cover:", error);
      setError(error instanceof Error ? error.message : "Failed to delete cover image");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`playlist-cover-uploader ${className}`}>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <div className="relative group">
        {/* Cover Image Display */}
        <div className="w-48 h-48 rounded-lg overflow-hidden bg-gray-800 border-2 border-gray-700">
          {currentCoverUrl ? (
            <MusicImage
              src={currentCoverUrl}
              alt="Playlist cover"
              size="large"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <PhotoIcon className="w-16 h-16 text-gray-500" />
            </div>
          )}

          {/* Overlay with upload/delete buttons */}
          <div className="absolute inset-0 bg-black bg-opacity-50 opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={uploading || deleting}
              className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full transition-colors disabled:opacity-50"
              aria-label={currentCoverUrl ? "Change cover" : "Upload cover"}
            >
              {uploading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <PhotoIcon className="w-6 h-6" />
              )}
            </button>

            {currentCoverUrl && (
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteCover();
                }}
                disabled={uploading || deleting}
                className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors disabled:opacity-50"
                aria-label="Delete cover"
              >
                {deleting ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <TrashIcon className="w-6 h-6" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload playlist cover"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Upload hint */}
      <p className="text-sm text-gray-400 mt-2 text-center">
        {currentCoverUrl
          ? "Change or remove the cover using the buttons"
          : "Choose an image to add a cover"}
      </p>
      <p className="text-xs text-gray-500 text-center">Max 5MB • JPEG, PNG, WebP</p>
    </div>
  );
}

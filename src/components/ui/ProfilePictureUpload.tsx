"use client";

import { useState, useRef } from "react";
import MusicImage from "./MusicImage";
import { userApi } from "@/lib/api";
import { UserIcon } from "@heroicons/react/24/outline";

interface ProfilePictureUploadProps {
  currentUserId: string;
  currentAvatarUrl?: string;
  onUploadSuccess?: (newAvatarUrl: string) => void;
  className?: string;
}

export default function ProfilePictureUpload({
  currentUserId,
  currentAvatarUrl,
  onUploadSuccess,
  className = "",
}: ProfilePictureUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("File size cannot exceed 5MB");
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const result = await userApi.uploadProfilePictureByIdentityId(currentUserId, file);
      onUploadSuccess?.(result.avatarUrl);
      setNotice("Photo saved.");
    } catch (error) {
      console.error("Failed to upload profile picture:", error);
      setError(error instanceof Error ? error.message : "Failed to upload profile picture");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };
  const remove = async () => {
    if (isUploading) return;
    setIsUploading(true);
    setError("");
    try {
      await userApi.updateUserProfileByIdentityId(currentUserId, { avatarUrl: "" });
      onUploadSuccess?.("");
      setNotice("Photo removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photo could not be removed. Retry.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`flex items-center space-x-4 ${className}`}>
      {/* Avatar Display */}
      <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center">
        {currentAvatarUrl ? (
          <MusicImage
            src={currentAvatarUrl}
            alt="Profile picture"
            size="large"
            type="circle"
            className="w-full h-full"
          />
        ) : (
          <UserIcon className="h-8 w-8 text-gray-400" />
        )}
      </div>

      {/* Upload Controls */}
      <div className="flex-1">
        <p className="text-white font-medium mb-2">Profile Picture</p>
        <div className="flex items-center space-x-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <button
            type="button"
            onClick={triggerFileSelect}
            disabled={isUploading}
            className={`inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition-colors ${isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {isUploading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Uploading...</span>
              </div>
            ) : (
              "Choose File"
            )}
          </button>
          {currentAvatarUrl && !isUploading && (
            <button
              type="button"
              onClick={() => {
                void remove();
              }}
              className="text-red-400 hover:text-red-300 text-sm font-medium"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-1">JPEG, PNG, or WebP. Max 5MB.</p>
        <p className="mt-1 text-xs text-gray-400">Photo changes are saved immediately.</p>
        {notice && (
          <p role="status" className="mt-1 text-sm text-purple-300">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-300 text-sm mt-1">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

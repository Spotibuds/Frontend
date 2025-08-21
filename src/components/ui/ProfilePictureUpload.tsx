"use client";

import { useState, useRef } from 'react';
import Image from 'next/image';
import { userApi } from '@/lib/api';

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
  className = "" 
}: ProfilePictureUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size cannot exceed 5MB');
      return;
    }

    setError('');
    setIsUploading(true);

    try {
      const result = await userApi.uploadProfilePictureByIdentityId(currentUserId, file);
      onUploadSuccess?.(result.avatarUrl);
    } catch (error) {
      console.error('Failed to upload profile picture:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload profile picture');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`flex items-center space-x-4 ${className}`}>
      {/* Avatar Display */}
      <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
        {currentAvatarUrl ? (
          <Image 
            src={currentAvatarUrl} 
            alt="Profile" 
            className="w-full h-full object-cover"
            width={80}
            height={80}
            onError={(e) => {
              // Fallback to initials if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          <span className="text-white font-bold text-2xl">
            👤
          </span>
        )}
        {currentAvatarUrl && (
          <span className="hidden text-white font-bold text-2xl">
            👤
          </span>
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
            onClick={triggerFileSelect}
            disabled={isUploading}
            className={`inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {isUploading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Uploading...</span>
              </div>
            ) : (
              'Choose File'
            )}
          </button>
          {currentAvatarUrl && !isUploading && (
            <button
              type="button"
              onClick={() => onUploadSuccess?.('')}
              className="text-red-400 hover:text-red-300 text-sm font-medium"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-gray-400 text-xs mt-1">
          JPEG, PNG, or WebP. Max 5MB.
        </p>
        {error && (
          <p className="text-red-400 text-sm mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}

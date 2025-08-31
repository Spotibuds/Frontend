"use client";

import { useState, useRef } from 'react';
import { PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';
import { musicApi } from '@/lib/api';
import MusicImage from './ui/MusicImage';

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
  className = ''
}: PlaylistCoverUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const result = await musicApi.uploadPlaylistCover(playlistId, file);
      onCoverUpdated?.(result.coverUrl);
    } catch (error) {
      console.error('Error uploading cover:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload cover image');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteCover = async () => {
    if (!currentCoverUrl) return;
    
    if (!confirm('Are you sure you want to delete the cover image?')) return;

    setDeleting(true);
    try {
      await musicApi.deletePlaylistCover(playlistId);
      onCoverUpdated?.(null);
    } catch (error) {
      console.error('Error deleting cover:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete cover image');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`playlist-cover-uploader ${className}`}>
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
          <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={uploading || deleting}
              className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full transition-colors disabled:opacity-50"
              title={currentCoverUrl ? "Change cover" : "Upload cover"}
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteCover();
                }}
                disabled={uploading || deleting}
                className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors disabled:opacity-50"
                title="Delete cover"
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
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Upload hint */}
      <p className="text-sm text-gray-400 mt-2 text-center">
        {currentCoverUrl ? 'Hover to change or delete cover' : 'Click to upload cover image'}
      </p>
      <p className="text-xs text-gray-500 text-center">
        Max 10MB • JPEG, PNG, WebP
      </p>
    </div>
  );
}

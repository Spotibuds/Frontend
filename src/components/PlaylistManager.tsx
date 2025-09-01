'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon, PencilIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { PlaylistService, Playlist, CreatePlaylistDto } from '@/lib/playlist';
import { useAudio } from '@/lib/audio';
import MusicImage from '@/components/ui/MusicImage';

interface PlaylistManagerProps {
  userId: string;
  onPlayPlaylist?: (playlist: Playlist) => void;
}

export default function PlaylistManager({ userId, onPlayPlaylist }: PlaylistManagerProps) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [formData, setFormData] = useState<CreatePlaylistDto>({ name: '', description: '' });
  const { addToQueue, clearQueue, playSong } = useAudio();

  const loadPlaylists = useCallback(async () => {
    try {
      const userPlaylists = await PlaylistService.getUserPlaylists(userId);
      setPlaylists(userPlaylists);
    } catch (error) {
      console.error('Failed to load playlists:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      const newPlaylist = await PlaylistService.createPlaylist(userId, {
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined
      });
      setPlaylists([...playlists, newPlaylist]);
      setFormData({ name: '', description: '' });
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlaylist || !formData.name.trim()) return;

    try {
      await PlaylistService.updatePlaylist(editingPlaylist.id, {
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined
      });
      setPlaylists(playlists.map(p => 
        p.id === editingPlaylist.id 
          ? { ...p, name: formData.name, description: formData.description }
          : p
      ));
      setEditingPlaylist(null);
      setFormData({ name: '', description: '' });
    } catch (error) {
      console.error('Failed to update playlist:', error);
    }
  };

  const handleDelete = async (playlistId: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;

    try {
      await PlaylistService.deletePlaylist(playlistId);
      setPlaylists(playlists.filter(p => p.id !== playlistId));
    } catch (error) {
      console.error('Failed to delete playlist:', error);
    }
  };

  const startEdit = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setFormData({ name: playlist.name, description: playlist.description || '' });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingPlaylist(null);
    setFormData({ name: '', description: '' });
  };

  const handlePlay = (playlist: Playlist) => {
    if (playlist.songs.length > 0) {
      // Clear the existing queue and add playlist songs
      clearQueue();
      const [firstSong, ...remainingSongs] = playlist.songs;
      playSong(firstSong);
      if (remainingSongs.length > 0) {
        addToQueue(remainingSongs);
      }
      onPlayPlaylist?.(playlist);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Your Playlists</h2>
          <p className="text-gray-400">Manage your music collections</p>
        </div>
        <button
          onClick={() => {
            setShowCreateForm(true);
            setEditingPlaylist(null);
            setFormData({ name: '', description: '' });
          }}
          className="flex items-center space-x-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          <PlusIcon className="w-5 h-5" />
          <span>Create Playlist</span>
        </button>
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingPlaylist) && (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <MusicalNoteIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">
                {editingPlaylist ? 'Edit Playlist' : 'Create New Playlist'}
              </h3>
              <p className="text-gray-400">
                {editingPlaylist ? 'Update your playlist details' : 'Give your playlist a name and description'}
              </p>
            </div>
          </div>
          
          <form onSubmit={editingPlaylist ? handleUpdate : handleCreate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Playlist Name *
              </label>
              <input
                type="text"
                placeholder="My Awesome Playlist"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors placeholder-gray-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description (Optional)
              </label>
              <textarea
                placeholder="Describe your playlist..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors h-24 resize-none placeholder-gray-400"
              />
            </div>
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                {editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  cancelEdit();
                }}
                className="flex-1 sm:flex-none bg-gray-600 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Playlists Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 group cursor-pointer"
            onClick={() => router.push(`/playlists/${playlist.id}`)}
          >
            {/* Playlist Cover */}
            <div className="relative mb-4">
              <div className="w-full aspect-square rounded-xl overflow-hidden shadow-lg">
                {playlist.coverUrl ? (
                  <MusicImage 
                    src={playlist.coverUrl} 
                    alt={playlist.name} 
                    size="large"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center">
                    <MusicalNoteIcon className="w-16 h-16 text-white" />
                  </div>
                )}
              </div>
              
              {/* Action Buttons Overlay */}
              <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(playlist);
                  }}
                  className="p-2 bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 rounded-lg transition-colors"
                  title="Edit playlist"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(playlist.id);
                  }}
                  className="p-2 bg-black/60 backdrop-blur-sm text-white hover:bg-red-500 hover:bg-opacity-80 rounded-lg transition-colors"
                  title="Delete playlist"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Playlist Info */}
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                {playlist.name}
              </h3>
              
              {playlist.description && (
                <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">
                  {playlist.description}
                </p>
              )}
              
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center text-gray-400 text-sm">
                  <MusicalNoteIcon className="w-4 h-4 mr-2" />
                  <span>
                    {playlist.songs.length} {playlist.songs.length === 1 ? 'song' : 'songs'}
                  </span>
                </div>
                
                {playlist.songs.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(playlist);
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                    title="Play playlist"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {playlists.length === 0 && (
        <div className="text-center py-16 bg-gray-800/40 backdrop-blur-sm border border-gray-700 rounded-2xl">
          <div className="w-24 h-24 mx-auto bg-gray-700/50 rounded-full flex items-center justify-center mb-6">
            <MusicalNoteIcon className="w-12 h-12 text-gray-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-400 mb-3">No playlists yet</h3>
          <p className="text-gray-500 text-lg mb-6">Create your first playlist to get started!</p>
          <button
            onClick={() => {
              setShowCreateForm(true);
              setEditingPlaylist(null);
              setFormData({ name: '', description: '' });
            }}
            className="inline-flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            <PlusIcon className="w-5 h-5" />
            <span>Create Your First Playlist</span>
          </button>
        </div>
      )}
    </div>
  );
}

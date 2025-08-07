'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PlaylistManager from '@/components/PlaylistManager';
import { identityApi } from '@/lib/api';

export default function PlaylistsPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const user = identityApi.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      </AppLayout>
    );
  }

  if (!currentUser) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-white">Please log in to view your playlists</h1>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        {/* Simple Header */}
        <div className="bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-white mb-2">My Playlists</h1>
              <p className="text-gray-400">Create and manage your music collections</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            {/* Main Content Card */}
            <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-8">
                <PlaylistManager userId={currentUser.id} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

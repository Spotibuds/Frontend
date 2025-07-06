"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { identityApi, musicApi, userApi, type User, type Song } from "@/lib/api";
import { formatDuration } from "@/lib/utils";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const currentUser = identityApi.getCurrentUser();
    if (!currentUser) {
      router.push("/");
      return;
    }

    setUser(currentUser);
    loadDashboardData();
  }, [router]);

  const loadDashboardData = async () => {
    try {
      const [songsData] = await Promise.all([
        musicApi.getSongs(),
      ]);
      setSongs(songsData.slice(0, 10)); // Show first 10 songs
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await identityApi.logout();
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
      // Still redirect even if logout API fails
      router.push("/");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text">SPOTIBUDS</h1>
          <p className="text-gray-400 mt-2">Welcome back, {user.username}!</p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          Sign Out
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Profile Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm text-gray-400">Username</label>
              <p className="text-gray-100">{user.username}</p>
            </div>
            <div>
              <label className="text-sm text-gray-400">Email</label>
              <p className="text-gray-100">{user.email}</p>
            </div>
            <div>
              <label className="text-sm text-gray-400">Account Type</label>
              <p className="text-gray-100">
                {user.isPrivate ? "Private" : "Public"}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-400">Roles</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Songs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Popular Songs</CardTitle>
          </CardHeader>
          <CardContent>
            {songs.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No songs available yet. Add some music to get started!
              </p>
            ) : (
              <div className="space-y-3">
                {songs.map((song) => (
                  <div
                    key={song.id}
                    className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 11-1.414-1.414A7.971 7.971 0 0017 12a7.971 7.971 0 00-1.343-4.243 1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-100 font-medium truncate">{song.title}</p>
                      <p className="text-gray-400 text-sm truncate">{song.artistName}</p>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      {song.genre && (
                        <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                          {song.genre}
                        </span>
                      )}
                      <span>{formatDuration(song.duration)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-gray-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button variant="outline" className="h-20 flex-col space-y-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Add Music</span>
          </Button>
          
          <Button variant="outline" className="h-20 flex-col space-y-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Find Friends</span>
          </Button>
          
          <Button variant="outline" className="h-20 flex-col space-y-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span>Create Playlist</span>
          </Button>
        </div>
      </div>
    </div>
  );
} 
"use client";
import { identityApi } from "@/lib/api";
import PlaylistManager from "@/components/PlaylistManager";
export default function PlaylistsPage() {
  const user = identityApi.getCurrentUser();
  return (
    <div className="page-shell">
      <div className="page-heading">
        <h1>Your library</h1>
        <p>Keep the music you love, together.</p>
      </div>
      {user ? <PlaylistManager userId={user.id} /> : <p>Sign in to see your playlists.</p>}
    </div>
  );
}

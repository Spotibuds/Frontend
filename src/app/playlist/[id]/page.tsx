"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
export default function LegacyPlaylistPage() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => router.replace(`/playlists/${String(params.id)}`), [params.id, router]);
  return <p role="status">Opening playlist…</p>;
}

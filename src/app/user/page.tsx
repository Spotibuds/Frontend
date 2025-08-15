"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { identityApi } from "@/lib/api";

export default function UserIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const me = identityApi.getCurrentUser();
    if (me?.id) {
      router.replace(`/user/${me.id}`);
    } else {
      router.replace("/");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <div className="text-white">Loading your profile…</div>
      </div>
    </div>
  );
}

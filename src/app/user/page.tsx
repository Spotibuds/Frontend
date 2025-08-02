"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { identityApi } from '@/lib/api';

export default function UserRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const currentUser = identityApi.getCurrentUser();
      if (currentUser && currentUser.id) {
        router.replace(`/user/${currentUser.id}`);
      } else {
        router.replace('/dashboard');
      }
    } catch (error) {
      console.error('Failed to get current user:', error);
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <AppLayout>
      <div className="p-6 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
          <span className="text-white">Loading your profile...</span>
        </div>
      </div>
    </AppLayout>
  );
}
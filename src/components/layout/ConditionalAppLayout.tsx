"use client";

import { usePathname } from 'next/navigation';
import AppLayout from './AppLayout';

interface ConditionalAppLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalAppLayout({ children }: ConditionalAppLayoutProps) {
  const pathname = usePathname();
  
  // Pages that should NOT have the AppLayout (auth pages)
  const authPages = ['/', '/register'];
  const isAuthPage = authPages.includes(pathname);
  
  if (isAuthPage) {
    return <>{children}</>;
  }
  
  return <AppLayout>{children}</AppLayout>;
}

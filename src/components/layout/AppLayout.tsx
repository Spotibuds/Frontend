"use client";

import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import { useDialog } from "@/hooks/useDialog";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import MusicImage from "@/components/ui/MusicImage";
import NotificationDropdown from "@/components/ui/NotificationDropdown";
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  MusicalNoteIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  NewspaperIcon,
  HeartIcon,
  ArrowLeftOnRectangleIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { useAudio } from "@/lib/audio";
import MusicPlayer from "@/components/MusicPlayer";
import { useFavorites } from "@/contexts/FavoritesContext";
import { identityApi, safeString, userApi } from "@/lib/api";
import { ToastContainer } from "@/components/ui/Toast";
import { useNotificationStore } from "@/contexts/NotificationContext";
import { notificationDestination, safeNotificationPath } from "@/lib/notificationState";
import { chatHub } from "@/lib/chatHub";
import { friendHubManager } from "@/lib/friendHub";
import { getSessionGeneration, SESSION_EVENT } from "@/lib/session";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true); // Default open on desktop
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebarDialog = useDialog(sidebarOpen && mobile && isLoggedIn && !isLoading, () =>
    setSidebarOpen(false)
  );
  useDeferredEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(query.matches);
      if (query.matches) setSidebarOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Load sidebar state from localStorage on mount
  useDeferredEffect(() => {
    if (typeof window !== "undefined") {
      let open = true;
      try {
        open = localStorage.getItem("sidebarOpen") !== "false";
      } catch {
        /* Use desktop default. */
      }
      setSidebarOpen(window.innerWidth >= 1024 && open);
    }
  }, []);

  // Save sidebar state to localStorage when it changes

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sidebarOpen", JSON.stringify(sidebarOpen));
      } catch {
        /* Navigation works without persistence. */
      }
      // Dispatch custom event for same-window listeners
      window.dispatchEvent(new CustomEvent("sidebarToggle"));
    }
  }, [sidebarOpen]);
  const favorites = useFavorites();
  const router = useRouter();
  const notifications = useNotificationStore();
  useEffect(() => {
    const navigate = (event: Event) => {
      const url = (event as CustomEvent).detail;
      if (typeof url === "string" && safeNotificationPath(url)) router.push(url);
    };
    window.addEventListener("spotibuds:navigate", navigate);
    return () => window.removeEventListener("spotibuds:navigate", navigate);
  }, [router]);
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const { state } = useAudio();

  // Toast state
  const [toasts, setToasts] = useState<
    Array<{
      id: string;
      message: string;
      type: "success" | "error" | "info";
      action?: {
        label: string;
        onClick: () => void;
      };
    }>
  >([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (
      message: string,
      type: "success" | "error" | "info" = "info",
      action?: { label: string; onClick: () => void }
    ) => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts(prev => [...prev, { id, message, type, action }]);
      setTimeout(() => removeToast(id), action ? 8000 : 5000); // Longer duration for actionable toasts
    },
    [removeToast]
  );

  useEffect(() => {
    let active = true;
    const initializeUser = async () => {
      // Use the new method that checks token validity
      const currentUser = await identityApi.getCurrentUserWithTokenCheck();
      if (!active) return;
      if (currentUser) {
        setIsLoggedIn(true);
        setIsAdmin(currentUser.roles?.includes("Admin") || false);

        // Enable chat hub when authenticated
        void chatHub
          .enableConnection()
          .catch(() => addToast("Chat could not connect. Open Messages to reconnect.", "error"));

        void friendHubManager
          .connect(currentUser.id)
          .catch(() =>
            addToast("Friend updates could not connect. Open Friends to reconnect.", "error")
          );

        // Load full user profile to get avatar and other details
        try {
          const fullProfile = await userApi.getCurrentUserProfile();
          if (!active) return;
          if (fullProfile) {
            setUser(fullProfile);
          } else {
            // Fallback to basic user data
            setUser(currentUser);
          }
        } catch (error) {
          console.error("Failed to load user profile, using basic data:", error);
          setUser(currentUser);
        }
      } else {
        // No valid user/token, disable notifications and redirect to login
        chatHub.disableConnection();
        void friendHubManager.disconnect();
        setIsLoggedIn(false);
        setUser(null);
      }
      setIsLoading(false);
    };

    void initializeUser().catch(() => {
      if (active) {
        setIsLoggedIn(false);
        setIsLoading(false);
      }
    });
    const sessionChanged = (event: Event) => {
      if ((event as CustomEvent).detail?.reason !== "authenticated") {
        setIsLoggedIn(false);
        setUser(null);
        setToasts([]);
        router.replace("/");
      }
    };
    window.addEventListener(SESSION_EVENT, sessionChanged);
    return () => {
      active = false;
      window.removeEventListener(SESSION_EVENT, sessionChanged);
      void chatHub.disableConnection();
      void friendHubManager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  useEffect(
    () =>
      notifications.subscribeIncoming(notification => {
        const destination = notificationDestination(notification);
        addToast(
          `${notification.title}: ${notification.message}`,
          "info",
          destination
            ? {
                label: "Open notification",
                onClick: () => {
                  const generation = getSessionGeneration();
                  void notifications.openDestination(notification.id).then(path => {
                    if (
                      path &&
                      generation === getSessionGeneration() &&
                      notifications.getSnapshot().ownerId === notification.targetUserId
                    )
                      router.push(path);
                  });
                },
              }
            : undefined
        );
      }),
    [notifications, addToast, router]
  );

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".notifications-dropdown")) {
        setNotificationsOpen(false);
      }
    };

    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notificationsOpen]);

  // Real-time friend request updates - handled by useFriendHub hook in individual pages
  // Removed duplicate event handler setup to prevent infinite loop

  const handleLogout = async () => {
    // Disable notifications and chat before logout
    void chatHub.disableConnection();
    try {
      await identityApi.logout();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Server logout failed. Retry sign-out.",
        "error"
      );
    }
    setIsLoggedIn(false);
    router.push("/");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Close sidebar on mobile when navigating
  const handleNavClick = () => {
    // Only close sidebar on mobile (screen width < 1024px)
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const navigation = [
    { name: "Home", href: "/dashboard", icon: HomeIcon, current: pathname === "/dashboard" },
    { name: "Feed", href: "/feed", icon: NewspaperIcon, current: pathname.startsWith("/feed") },
    { name: "Browse", href: "/music", icon: MusicalNoteIcon, current: pathname === "/music" },
    { name: "Search", href: "/search", icon: MagnifyingGlassIcon, current: pathname === "/search" },
    {
      name: "Playlists",
      href: "/playlists",
      icon: ListBulletIcon,
      current: pathname.startsWith("/playlists") || pathname.startsWith("/playlist/"),
    },
    { name: "Friends", href: "/friends", icon: UserGroupIcon, current: pathname === "/friends" },
    {
      name: "Chat",
      href: "/chat",
      icon: ChatBubbleLeftRightIcon,
      current: pathname.startsWith("/chat"),
    },
    ...(isAdmin
      ? [
          {
            name: "Admin",
            href: "/admin",
            icon: BriefcaseIcon,
            current: pathname.startsWith("/admin"),
          },
        ]
      : []),
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-800 flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="flex items-center justify-center space-x-3 mb-8">
            <MusicalNoteIcon className="h-12 w-12 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">SpotiBuds</h1>
          </div>
          <p className="text-xl text-gray-300 mb-8">Please log in to continue</p>
          <div className="space-x-4">
            <button
              onClick={() => router.push("/")}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-gray-100 focus:p-3 focus:text-gray-950"
      >
        Skip to content
      </a>
      {state.error && (
        <p
          role="alert"
          className="fixed top-16 right-3 max-w-lg bg-red-950 text-red-200 p-3 rounded z-50"
        >
          {state.error}
        </p>
      )}
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div data-dialog-backdrop="true" className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Sidebar */}
      <div
        ref={sidebarDialog}
        role={mobile && sidebarOpen ? "dialog" : undefined}
        aria-modal={mobile && sidebarOpen ? true : undefined}
        aria-label={mobile && sidebarOpen ? "Navigation" : undefined}
        tabIndex={-1}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        data-testid="app-sidebar"
        className={`fixed inset-y-0 left-0 z-[75] lg:z-40 w-64 sm:w-72 bg-gray-950 transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-300 ease-in-out flex flex-col`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-800">
          <Link href="/dashboard" className="flex items-center space-x-3">
            <Image
              src="/logo.svg"
              alt="Spotibuds Logo"
              width={32}
              height={32}
              className="h-8 w-8"
              priority
            />
            <span className="text-xl font-semibold text-white">Spotibuds</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Close sidebar"
            aria-label="Close navigation"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
          {navigation.map(item => (
            <Link
              key={item.name}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={`flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
                item.current
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
              onClick={handleNavClick}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          ))}
          <div className="mt-6 border-t border-gray-800 pt-5">
            <Link
              href={favorites.playlistId ? `/playlists/${favorites.playlistId}` : "/playlists"}
              onClick={handleNavClick}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <HeartIcon className="h-5 w-5 text-purple-400" />
              Liked Songs
            </Link>
          </div>
        </nav>

        {/* User menu */}
        <div className="border-t border-gray-800 p-4 pb-28">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-300 rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
          >
            <ArrowLeftOnRectangleIcon className="mr-3 h-5 w-5" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className={`transition-all duration-300 ${sidebarOpen ? "lg:pl-72" : "pl-0"}`}>
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 bg-gray-900 border-b border-gray-700">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Sidebar toggle button (only when sidebar is closed) */}
              <button
                className={`icon-button ${sidebarOpen ? "lg:invisible" : ""}`}
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title="Open sidebar"
                aria-label="Open navigation"
                aria-expanded={sidebarOpen}
              >
                <Bars3Icon className="h-6 w-6" />
              </button>

              {/* Search Bar */}
              <div className="flex-1 max-w-lg mx-2 sm:mx-4">
                <form onSubmit={handleSearch} className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    aria-label="Search music and people"
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search music and people"
                    className="w-full bg-gray-700 text-white placeholder-gray-400 pl-8 sm:pl-10 pr-4 py-2 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 border border-gray-600 hover:border-gray-500 transition-colors"
                  />
                </form>
              </div>

              {/* Right side items */}
              <div className="flex items-center space-x-4">
                {/* Notifications */}
                <NotificationDropdown userId={user?.id || ""} isLoggedIn={isLoggedIn} />

                {/* Profile Menu */}
                <div className="relative">
                  <Link
                    href={user?.id ? `/user/${user.id}` : "/user"}
                    aria-label="Open your profile"
                    className="flex min-h-11 items-center space-x-2 sm:space-x-3 text-gray-300 hover:text-white transition-colors"
                  >
                    {user?.avatarUrl ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                        <MusicImage
                          src={user.avatarUrl}
                          alt={user.username || "User"}
                          className="w-full h-full object-cover"
                          size="small"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">
                          {safeString(user?.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="hidden md:block font-medium">
                      {safeString(user?.username)}
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="min-w-0 pb-36 md:pb-28">
          {favorites.error && (
            <div
              role="alert"
              className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-950 p-3 text-sm text-red-200"
            >
              {favorites.error}
              <button
                type="button"
                onClick={() => {
                  void favorites.reload();
                }}
                className="underline"
              >
                Retry favorites
              </button>
            </div>
          )}
          {children}
        </main>

        {/* Toast notifications */}
        <ToastContainer toasts={toasts} onRemoveToast={removeToast} />

        <MusicPlayer />
      </div>
    </div>
  );
}

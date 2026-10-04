"use client";
import { BellIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useNotifications } from "@/contexts/NotificationContext";
import NotificationItem, { notificationButton } from "@/components/ui/NotificationItem";
import NotificationStatus, { NotificationActions } from "@/components/ui/NotificationStatus";

export default function NotificationsPage() {
  const {
    store,
    ownerId,
    notifications,
    totalCount,
    unreadCount,
    loading,
    synced,
    error,
    syncing,
    showingOlder,
    hasMore,
  } = useNotifications();
  return (
    <main className="min-h-screen min-w-0 bg-gray-800 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="mt-2 text-purple-100">
              {unreadCount === null
                ? "Your saved updates"
                : `${unreadCount} unread, ${totalCount ?? "unknown"} total`}
            </p>
          </div>
          {ownerId && (
            <div className="rounded-xl bg-white p-1 dark:bg-gray-800">
              <NotificationActions />
            </div>
          )}
        </div>
        {!ownerId ? (
          <p role="status">
            Sign in to see your notifications.{" "}
            <Link href="/" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        ) : (
          <>
            <div className="mb-4 rounded-xl bg-white dark:bg-gray-800">
              <NotificationStatus />
            </div>
            {!loading && synced && !error && !notifications.length && (
              <div className="py-12 text-center">
                <BellIcon aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-purple-200" />
                <h2 className="text-xl font-semibold">No notifications yet</h2>
                <p className="mt-2 text-purple-100">
                  Messages, friend requests and activity updates will appear here.
                </p>
              </div>
            )}
            <div className="overflow-hidden rounded-xl divide-y divide-gray-200 dark:divide-gray-700">
              {notifications.map(item => (
                <NotificationItem key={item.id} notification={item} />
              ))}
            </div>
            {showingOlder && (
              <div className="mt-6 text-center">
                <p className="mb-2 text-purple-100">Showing an older notification window.</p>
                <button
                  disabled={syncing}
                  className={`${notificationButton} bg-white text-purple-800 hover:bg-purple-100`}
                  onClick={() => void store.returnToLatest()}
                >
                  Return to latest notifications
                </button>
              </div>
            )}
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  disabled={syncing}
                  className={`${notificationButton} bg-white text-purple-800 hover:bg-purple-100`}
                  onClick={() => void store.loadMore()}
                >
                  Load older notifications
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BellIcon } from "@heroicons/react/24/outline";
import { useNotifications } from "@/contexts/NotificationContext";
import NotificationItem from "./NotificationItem";
import NotificationStatus, { NotificationActions } from "./NotificationStatus";

export default function NotificationDropdown({
  userId,
  isLoggedIn,
}: {
  userId: string;
  isLoggedIn: boolean;
}) {
  const { notifications, unreadCount, ownerId, loading, synced, error } = useNotifications();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button:not([disabled]),a")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !panel.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  if (!isLoggedIn || !ownerId || ownerId !== userId) return null;
  return (
    <div
      ref={root}
      className="notifications-dropdown relative"
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          bell.current?.focus();
        }
      }}
      onBlur={event => {
        if (
          event.relatedTarget &&
          !root.current?.contains(event.relatedTarget as Node) &&
          !panel.current?.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        ref={bell}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={`${id}-count`}
        onClick={() => setOpen(value => !value)}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-gray-200 hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
      >
        <BellIcon aria-hidden="true" className="h-6 w-6" />
        {!!unreadCount && (
          <span
            aria-hidden="true"
            data-testid="notification-unread-count"
            className="absolute end-0 top-0 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs leading-5 text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <span id={`${id}-count`} className="sr-only">
        {unreadCount === null ? "Unread count loading" : `${unreadCount} unread notifications`}
      </span>
      {open &&
        createPortal(
          <div
            id={id}
            ref={panel}
            role="region"
            aria-label="Notification inbox"
            className="fixed inset-x-3 top-20 z-[80] overflow-hidden rounded-xl bg-gray-800 text-white shadow-lg shadow-black/20 sm:start-auto sm:end-4 sm:w-96"
          >
            <div className="border-b border-gray-200 p-4 dark:border-gray-700">
              <h2 className="font-semibold">Notifications</h2>
              <NotificationActions />
            </div>
            <div className="max-h-[min(65vh,36rem)] overflow-y-auto overscroll-contain">
              <NotificationStatus />
              {!loading && synced && !error && !notifications.length && (
                <p className="p-6 text-center text-gray-600 dark:text-gray-300">
                  No notifications yet.
                </p>
              )}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.slice(0, 20).map(item => (
                  <NotificationItem key={item.id} notification={item} />
                ))}
              </div>
            </div>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block min-h-11 border-t border-gray-200 p-3 text-center text-sm font-medium text-purple-700 hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-purple-600 dark:border-gray-700 dark:text-purple-300 dark:hover:bg-gray-700"
            >
              View all notifications
            </Link>
          </div>,
          document.body
        )}
    </div>
  );
}

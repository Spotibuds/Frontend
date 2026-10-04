"use client";
import {
  BellIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  HeartIcon,
  CheckIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/api";
import { useNotifications } from "@/contexts/NotificationContext";
import { getSessionGeneration } from "@/lib/session";
import { notificationDestination, notificationTime } from "@/lib/notificationState";

export const notificationButton =
  "min-h-11 min-w-11 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:cursor-not-allowed disabled:opacity-50";
export default function NotificationItem({ notification }: { notification: Notification }) {
  const { store, busy } = useNotifications();
  const router = useRouter();
  const disabled = busy.has(notification.id) || busy.has("bulk");
  const destination = notificationDestination(notification);
  const actionable =
    notification.type === "FriendRequest" &&
    notification.status !== "Handled" &&
    typeof notification.data?.requestId === "string" &&
    /^[a-f0-9]{24}$/i.test(notification.data.requestId);
  const Icon =
    notification.type === "Message"
      ? ChatBubbleLeftRightIcon
      : notification.type === "Reaction"
        ? HeartIcon
        : notification.type.startsWith("Friend") || notification.type === "Follow"
          ? UserGroupIcon
          : BellIcon;
  const open = async () => {
    const generation = getSessionGeneration();
    const latest = await store.openDestination(notification.id);
    if (
      latest &&
      generation === getSessionGeneration() &&
      store.getSnapshot().ownerId === notification.targetUserId
    )
      router.push(latest);
  };
  return (
    <article
      data-notification-id={notification.id}
      className={`min-w-0 p-4 ${notification.status === "Unread" ? "bg-blue-50 dark:bg-blue-950/40" : "bg-white dark:bg-gray-800"}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          aria-hidden="true"
          className="mt-1 h-6 w-6 shrink-0 text-purple-700 dark:text-purple-300"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3
              className="font-semibold text-gray-900 [overflow-wrap:anywhere] dark:text-white"
              dir="auto"
            >
              {notification.title}
            </h3>
            <span
              className={`text-xs font-medium ${notification.status === "Unread" ? "text-blue-800 dark:text-blue-200" : "text-gray-600 dark:text-gray-300"}`}
            >
              {notification.status === "Handled" ? "Resolved" : notification.status}
            </span>
          </div>
          <p
            className="mt-1 whitespace-pre-wrap text-sm text-gray-700 [overflow-wrap:anywhere] dark:text-gray-200"
            dir="auto"
          >
            {notification.message}
          </p>
          <time
            className="mt-2 block text-xs text-gray-600 dark:text-gray-300"
            dateTime={notification.createdAt}
            title={notificationTime(notification.createdAt)}
          >
            {notificationTime(notification.createdAt)}
          </time>
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {actionable && (
              <>
                <button
                  disabled={disabled}
                  className={`${notificationButton} bg-purple-700 text-white hover:bg-purple-800`}
                  onClick={() => void store.respondToFriendRequest(notification, "accept")}
                >
                  Accept
                </button>
                <button
                  disabled={disabled}
                  className={`${notificationButton} text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700`}
                  onClick={() => void store.respondToFriendRequest(notification, "decline")}
                >
                  Decline
                </button>
              </>
            )}
            {destination && (
              <button
                aria-label="Open notification"
                disabled={disabled}
                onClick={() => void open()}
                className={`${notificationButton} text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-gray-700`}
              >
                <ArrowTopRightOnSquareIcon aria-hidden="true" className="inline h-4 w-4" />
                <span className="ms-1">Open</span>
              </button>
            )}
            {notification.status === "Unread" && (
              <button
                aria-label="Mark as read"
                disabled={disabled}
                onClick={() => void store.markAsRead(notification.id)}
                className={`${notificationButton} text-green-800 hover:bg-green-100 dark:text-green-300 dark:hover:bg-gray-700`}
              >
                <CheckIcon aria-hidden="true" className="h-5 w-5" />
              </button>
            )}
            <button
              aria-label="Delete notification"
              disabled={disabled}
              onClick={() => void store.dismiss(notification.id)}
              className={`${notificationButton} text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-gray-700`}
            >
              <TrashIcon aria-hidden="true" className="h-5 w-5" />
            </button>
            {busy.has(notification.id) && (
              <span role="status" className="text-sm text-gray-600 dark:text-gray-300">
                Saving...
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

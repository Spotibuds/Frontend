"use client";
import { useNotifications } from "@/contexts/NotificationContext";
import { notificationButton } from "./NotificationItem";

export default function NotificationStatus() {
  const {
    store,
    error,
    actionError,
    syncing,
    synced,
    loading,
    connectionState,
    browserPermission,
  } = useNotifications();
  return (
    <div className="space-y-2 p-4 text-sm text-gray-700 dark:text-gray-200">
      {(error || actionError) && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-red-800 [overflow-wrap:anywhere] dark:bg-red-950/40 dark:text-red-200"
        >
          {actionError && <p>{actionError}</p>}
          {error && error !== actionError && <p>{error}</p>}
          <button
            className={`${notificationButton} underline underline-offset-4`}
            disabled={syncing}
            onClick={() => void store.refresh()}
          >
            Retry notifications
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading notifications...</p>
      ) : syncing ? (
        <p role="status">Refreshing notifications...</p>
      ) : !synced && !error ? (
        <p role="status">Notification changes are syncing. Counts show the last saved snapshot.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>
          Live updates{" "}
          {connectionState === "Connected"
            ? "connected"
            : connectionState === "Reconnecting" || connectionState === "Connecting"
              ? "reconnecting"
              : "disconnected"}
        </span>
        {connectionState === "Disconnected" && (
          <button
            className={`${notificationButton} underline underline-offset-4`}
            onClick={() => void store.reconnect()}
          >
            Reconnect live updates
          </button>
        )}
        {browserPermission === "default" && (
          <button
            className={`${notificationButton} text-purple-700 underline underline-offset-4 dark:text-purple-300`}
            onClick={() => void store.requestBrowserPermission()}
          >
            Enable browser notifications
          </button>
        )}
        {browserPermission === "denied" && (
          <span>Browser alerts are blocked. In-app notifications remain available.</span>
        )}
        {browserPermission === "granted" && <span>Browser alerts enabled</span>}
      </div>
    </div>
  );
}
export function NotificationActions() {
  const { store, unreadCount, totalCount, busy } = useNotifications();
  return (
    <div className="flex flex-wrap gap-1">
      {!!unreadCount && (
        <button
          disabled={!!busy.size}
          className={`${notificationButton} text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-gray-700`}
          onClick={() => void store.bulk("read")}
        >
          Mark all read
        </button>
      )}
      {!!totalCount && (
        <button
          disabled={!!busy.size}
          className={`${notificationButton} text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-gray-700`}
          onClick={() => {
            if (
              window.confirm(
                "Delete all current notifications? New notifications arriving after this action will stay in your inbox."
              )
            )
              void store.bulk("dismiss");
          }}
        >
          Delete all
        </button>
      )}
    </div>
  );
}

import type { Notification } from "./api";

const types = new Set([
  "FriendRequest",
  "FriendRequestAccepted",
  "FriendRequestDeclined",
  "FriendRemoved",
  "Message",
  "Other",
  "Follow",
  "Reaction",
]);
export function validNotification(value: Notification, owner: string): boolean {
  return Boolean(
    value &&
    /^[a-f0-9]{24}$/i.test(value.id) &&
    value.targetUserId === owner &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    !!value.data &&
    typeof value.data === "object" &&
    !Array.isArray(value.data) &&
    types.has(value.type) &&
    ["Unread", "Read", "Handled"].includes(value.status) &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    !value.dismissedAt &&
    (!value.expiresAt || Date.parse(value.expiresAt) > Date.now())
  );
}
export function compareNotifications(left: Notification, right: Notification) {
  return (
    Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)
  );
}
export function mergeNotifications(current: Notification[], incoming: Notification[]) {
  const items = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) items.set(item.id, item);
  return [...items.values()].sort((a, b) => compareNotifications(b, a));
}
export function notificationDestination(notification: Notification): string | null {
  // The server projects links through current privacy and parent-resource state.
  if (notification.actionUrl && safeNotificationPath(notification.actionUrl))
    return notification.actionUrl;
  const data = notification.data || {};
  if (notification.type.startsWith("Friend")) return "/friends";
  if (notification.type === "Message")
    return typeof data.chatId === "string" && /^[a-f0-9]{24}$/i.test(data.chatId)
      ? "/chat/" + data.chatId
      : null;
  if (notification.type === "Reaction") {
    const postId = data.actionPostId || data.postId;
    const path =
      typeof postId === "string" && postId.length <= 300
        ? "/feed/post/" + encodeURIComponent(postId)
        : "";
    return safeNotificationPath(path) ? path : null;
  }
  if (notification.type === "Follow" && notification.sourceUserId) {
    const path = "/user/" + notification.sourceUserId;
    return safeNotificationPath(path) ? path : null;
  }
  return null;
}
export function notificationTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Time unavailable";
}

export function safeNotificationPath(url: string): boolean {
  if (["/friends", "/notifications"].includes(url)) return true;
  if (/^\/chat\/[a-f0-9]{24}$/i.test(url)) return true;
  if (/^\/user\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(url))
    return true;
  if (!/^\/feed\/post\/[a-z0-9%_.~!()*'-]+$/i.test(url)) return false;
  try {
    const postId = decodeURIComponent(url.slice("/feed/post/".length));
    return (
      !!postId &&
      ![".", ".."].includes(postId) &&
      postId.length <= 300 &&
      !/[\u0000-\u001f\u007f\\]/.test(postId)
    );
  } catch {
    return false;
  }
}

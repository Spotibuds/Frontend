import {
  notificationsApi,
  userApi,
  type Notification,
  type NotificationCommandResult,
} from "./api";
import { notificationHub, type NotificationHandlers } from "./notificationHub";
import { getSessionGeneration } from "./session";
import { eventBus } from "./eventBus";
import {
  compareNotifications,
  mergeNotifications,
  notificationDestination,
  validNotification,
} from "./notificationState";

export interface NotificationSnapshot {
  ownerId: string | null;
  notifications: Notification[];
  unreadCount: number | null;
  totalCount: number | null;
  loading: boolean;
  syncing: boolean;
  synced: boolean;
  error: string;
  actionError: string;
  busy: ReadonlySet<string>;
  connectionState: string;
  showingOlder: boolean;
  hasMore: boolean;
  browserPermission: NotificationPermission | "unsupported";
}
const empty: NotificationSnapshot = {
  ownerId: null,
  notifications: [],
  unreadCount: null,
  totalCount: null,
  loading: false,
  syncing: false,
  synced: false,
  error: "",
  actionError: "",
  busy: new Set(),
  connectionState: "Disconnected",
  showingOlder: false,
  hasMore: false,
  browserPermission: "unsupported",
};
type Dependencies = {
  api: Pick<
    typeof notificationsApi,
    | "getNotifications"
    | "markAsRead"
    | "markAllAsRead"
    | "deleteNotification"
    | "deleteAllNotifications"
  >;
  social: Pick<typeof userApi, "acceptFriendRequest" | "declineFriendRequest">;
  hub: Pick<
    typeof notificationHub,
    "setHandlers" | "removeHandlers" | "enableConnection" | "disableConnection" | "reconnect"
  >;
  generation: () => number;
};

// One owner and one canonical synchronization path for the badge, dropdown and page.
export class NotificationStore {
  private state = empty;
  private listeners = new Set<() => void>();
  private chatCounts = new Set<() => void>();
  private incoming = new Set<(notification: Notification) => void>();
  private epoch = 0;
  private generation = 0;
  private revision = 0;
  private windowSize = 50;
  private latestBoundary: Notification | undefined;
  private historyBefore: string | undefined;
  private nextBefore: string | undefined;
  private operation: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();
  private desktop = new Set<globalThis.Notification>();
  private desktopTimers = new Set<ReturnType<typeof setTimeout>>();
  constructor(
    private deps: Dependencies = {
      api: notificationsApi,
      social: userApi,
      hub: notificationHub,
      generation: getSessionGeneration,
    }
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeIncoming = (listener: (notification: Notification) => void) => {
    this.incoming.add(listener);
    return () => {
      this.incoming.delete(listener);
    };
  };
  subscribeChatCounts = (listener: () => void) => {
    this.chatCounts.add(listener);
    return () => {
      this.chatCounts.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  getServerSnapshot = () => empty;
  private update(patch: Partial<NotificationSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private owned(epoch: number) {
    return (
      epoch === this.epoch && !!this.state.ownerId && this.generation === this.deps.generation()
    );
  }
  setOwner(ownerId: string | null) {
    const generation = this.deps.generation();
    if (ownerId === this.state.ownerId && generation === this.generation) return;
    const epoch = ++this.epoch;
    this.generation = generation;
    this.revision++;
    this.operation = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deps.hub.removeHandlers("NotificationStore");
    this.desktop.forEach(item => item.close());
    this.desktop.clear();
    this.desktopTimers.forEach(timer => clearTimeout(timer));
    this.desktopTimers.clear();
    this.seen.clear();
    this.windowSize = 50;
    this.historyBefore = undefined;
    this.nextBefore = undefined;
    this.latestBoundary = undefined;
    this.state = {
      ...empty,
      ownerId,
      loading: !!ownerId,
      browserPermission:
        typeof window !== "undefined" && "Notification" in window
          ? window.Notification.permission
          : "unsupported",
    };
    this.listeners.forEach(listener => listener());
    const stopped = this.deps.hub.disableConnection();
    if (!ownerId) {
      void stopped.catch(() => undefined);
      return;
    }
    const changed = () => {
      if (this.owned(epoch)) this.invalidate();
    };
    const handlers: NotificationHandlers = {
      onNewNotification: value => {
        if (!this.owned(epoch) || !validNotification(value, ownerId)) return;
        const first = !this.seen.has(value.id);
        this.seen.add(value.id);
        if (!this.latestBoundary || compareNotifications(value, this.latestBoundary) > 0)
          this.latestBoundary = value;
        if (
          first &&
          !this.historyBefore &&
          !this.state.notifications.some(item => item.id === value.id)
        )
          this.update({
            notifications: mergeNotifications(this.state.notifications, [value]).slice(
              0,
              this.windowSize
            ),
          });
        this.invalidate();
        if (first) {
          this.incoming.forEach(listener => listener(value));
          this.showBrowser(value, epoch);
        }
      },
      onNotificationsChanged: value => {
        if (value.userId === ownerId) changed();
      },
      onNotificationDeleted: value => {
        if (value.userId === ownerId) changed();
      },
      onUnreadCountUpdate: changed,
      onChatUnreadCountUpdate: () => {
        if (this.owned(epoch)) this.chatCounts.forEach(listener => listener());
      },
      onNotificationMarkedRead: changed,
      onNotificationHandled: changed,
      onAllNotificationsMarkedRead: changed,
      onNotificationsLoaded: changed,
      onConnectionStateChange: state => {
        if (!this.owned(epoch)) return;
        this.update({ connectionState: state });
        if (state === "Connected") this.invalidate();
      },
      onError: () => {
        if (this.owned(epoch))
          this.update({
            error: "Live notification updates failed. Refresh notifications or reconnect.",
          });
      },
    };
    this.deps.hub.setHandlers(handlers, "NotificationStore");
    void this.refresh();
    void stopped
      .catch(() => undefined)
      .then(async () => {
        if (!this.owned(epoch)) return;
        try {
          await this.deps.hub.enableConnection();
        } catch {
          if (this.owned(epoch))
            this.update({
              connectionState: "Disconnected",
              error:
                "Live notifications are disconnected. Your saved notifications remain available.",
            });
        }
      });
  }
  private invalidate() {
    this.revision++;
    this.update({ synced: false });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, 120);
  }
  refresh = (): Promise<boolean> => {
    if (this.operation) return this.operation;
    if (!this.state.ownerId) return Promise.resolve(false);
    const epoch = this.epoch;
    const owner = this.state.ownerId;
    const operation = (async () => {
      this.update({ syncing: true, error: "" });
      try {
        // One coalesced follow-up handles an event racing the first snapshot; never retry failures forever.
        for (let pass = 0; pass < 2; pass++) {
          const revision = this.revision;
          let notifications: Notification[] = [];
          let before = this.historyBefore;
          let unreadCount = 0;
          let totalCount = 0;
          let latestBoundary: Notification | undefined;
          if (this.historyBefore) {
            const latest = await this.deps.api.getNotifications(owner, 1, 0);
            if (!this.owned(epoch)) return false;
            latestBoundary = latest.notifications.find(item => validNotification(item, owner));
          }
          for (let page = 0; page < Math.ceil(this.windowSize / 50); page++) {
            const response = await this.deps.api.getNotifications(owner, 50, 0, before);
            if (!this.owned(epoch)) return false;
            if (
              !Array.isArray(response.notifications) ||
              !Number.isInteger(response.unreadCount) ||
              response.unreadCount < 0 ||
              !Number.isInteger(response.totalCount) ||
              response.totalCount < 0
            )
              throw new Error("The notification response could not be read. Refresh to retry.");
            if (page === 0) {
              unreadCount = response.unreadCount;
              totalCount = response.totalCount;
              if (!this.historyBefore)
                latestBoundary = response.notifications.find(item =>
                  validNotification(item, owner)
                );
            }
            notifications = mergeNotifications(
              notifications,
              response.notifications.filter(item => validNotification(item, owner))
            );
            before = response.nextBefore || undefined;
            if (!before) break;
          }
          if (revision !== this.revision) continue;
          // This snapshot covers every invalidation up to this revision. Clear
          // its pending debounce before notifying listeners, which may enqueue
          // newer activity requiring a fresh synchronization.
          if (this.timer) clearTimeout(this.timer);
          this.timer = null;
          this.nextBefore = before;
          this.latestBoundary = latestBoundary;
          notifications.forEach(item => this.seen.add(item.id));
          this.update({
            notifications,
            showingOlder: !!this.historyBefore,
            hasMore: !!before,
            unreadCount,
            totalCount,
            synced: true,
            loading: false,
            error: "",
          });
          return true;
        }
        this.update({
          error:
            "New activity arrived while notifications were loading. Refresh to finish syncing.",
          synced: false,
        });
        return false;
      } catch (cause) {
        if (this.owned(epoch))
          this.update({
            error:
              cause instanceof Error
                ? cause.message
                : "Notifications could not be loaded. Refresh to retry.",
            synced: false,
          });
        return false;
      } finally {
        if (this.owned(epoch)) this.update({ syncing: false, loading: false });
      }
    })();
    this.operation = operation;
    void operation.finally(() => {
      if (this.operation === operation) this.operation = null;
    });
    return operation;
  };
  loadMore = async () => {
    if (this.state.syncing || !this.state.hasMore) return;
    // At most 500 visible rows; older cursor windows remain reachable indefinitely.
    if (this.windowSize >= 500) {
      this.historyBefore = this.nextBefore;
      this.windowSize = 50;
    } else this.windowSize += 50;
    this.revision++;
    await this.refresh();
  };
  returnToLatest = async () => {
    this.historyBefore = undefined;
    this.windowSize = 50;
    this.revision++;
    await this.refresh();
  };
  reconnect = async () => {
    const epoch = this.epoch;
    try {
      await this.deps.hub.reconnect();
      if (this.owned(epoch)) await this.refresh();
    } catch {
      if (this.owned(epoch))
        this.update({
          error:
            "Live notifications could not reconnect. Refresh still retrieves saved notifications.",
        });
    }
  };
  private async execute(
    key: string,
    command: () => Promise<NotificationCommandResult>,
    confirmed: (result: NotificationCommandResult) => void
  ) {
    if (!this.state.ownerId || this.state.busy.has(key) || this.state.busy.has("bulk"))
      return false;
    const epoch = this.epoch;
    const commandRevision = ++this.revision;
    this.update({ busy: new Set([...this.state.busy, key]), actionError: "" });
    try {
      const result = await command();
      if (!this.owned(epoch)) return false;
      this.revision++;
      confirmed(result);
      const counts =
        commandRevision === this.revision - 1 &&
        Number.isInteger(result.unreadCount) &&
        (result.unreadCount ?? -1) >= 0 &&
        Number.isInteger(result.totalCount) &&
        (result.totalCount ?? -1) >= 0 &&
        !result.synchronizationPending;
      this.update({
        unreadCount: counts ? result.unreadCount : this.state.unreadCount,
        totalCount: counts ? result.totalCount : this.state.totalCount,
        synced: counts,
      });
      await this.refresh();
      return this.owned(epoch);
    } catch (cause) {
      if (this.owned(epoch)) {
        this.update({
          actionError:
            cause instanceof Error
              ? cause.message
              : "Notification change could not be saved. Please retry.",
        });
        await this.refresh();
      }
      return false;
    } finally {
      if (this.owned(epoch)) {
        const busy = new Set(this.state.busy);
        busy.delete(key);
        this.update({ busy });
      }
    }
  }
  markAsRead = async (id: string) => {
    const owner = this.state.ownerId;
    const item = this.state.notifications.find(value => value.id === id);
    if (!owner || !item) return false;
    if (item.status !== "Unread") return true;
    return this.execute(
      id,
      () => this.deps.api.markAsRead(id, owner),
      result => {
        if (result.notification && validNotification(result.notification, owner))
          this.update({
            notifications: mergeNotifications(this.state.notifications, [result.notification]),
          });
        else if (!result.synchronizationPending && result.notification === null)
          this.update({ notifications: this.state.notifications.filter(value => value.id !== id) });
      }
    );
  };
  openDestination = async (id: string): Promise<string | null> => {
    const epoch = this.epoch;
    if (!(await this.markAsRead(id)) || !this.owned(epoch)) return null;
    const latest = this.state.notifications.find(item => item.id === id);
    return latest && latest.status !== "Unread" && validNotification(latest, this.state.ownerId!)
      ? notificationDestination(latest)
      : null;
  };
  dismiss = async (id: string) => {
    const owner = this.state.ownerId;
    if (!owner) return false;
    return this.execute(
      id,
      () => this.deps.api.deleteNotification(id, owner),
      () =>
        this.update({ notifications: this.state.notifications.filter(value => value.id !== id) })
    );
  };
  bulk = async (action: "read" | "dismiss") => {
    const owner = this.state.ownerId;
    const boundary = this.latestBoundary;
    if (!owner || !boundary || this.state.busy.size) return false;
    return this.execute(
      "bulk",
      () =>
        action === "read"
          ? this.deps.api.markAllAsRead(owner, boundary.id)
          : this.deps.api.deleteAllNotifications(owner, boundary.id),
      () => {
        this.update({
          notifications:
            action === "dismiss"
              ? this.state.notifications.filter(value => compareNotifications(value, boundary) > 0)
              : this.state.notifications.map(value =>
                  value.status === "Unread" && compareNotifications(value, boundary) <= 0
                    ? { ...value, status: "Read" }
                    : value
                ),
        });
      }
    );
  };
  respondToFriendRequest = async (item: Notification, action: "accept" | "decline") => {
    const owner = this.state.ownerId;
    const requestId = item.data?.requestId;
    if (
      !owner ||
      item.targetUserId !== owner ||
      item.type !== "FriendRequest" ||
      item.status === "Handled" ||
      typeof requestId !== "string" ||
      !/^[a-f0-9]{24}$/i.test(requestId)
    )
      return false;
    return this.execute(
      item.id,
      async () => {
        if (action === "accept") await this.deps.social.acceptFriendRequest(requestId, owner);
        else await this.deps.social.declineFriendRequest(requestId, owner);
        return {
          message: "Friend request updated.",
          notification: null,
          totalCount: null,
          unreadCount: null,
          throughId: null,
          synchronizationPending: true,
        };
      },
      () => {
        eventBus.emit("friendshipStatusChanged", owner, item.sourceUserId);
      }
    );
  };
  requestBrowserPermission = async () => {
    const epoch = this.epoch;
    if (!this.state.ownerId || typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const permission = await window.Notification.requestPermission();
      if (this.owned(epoch)) this.update({ browserPermission: permission });
    } catch {
      if (this.owned(epoch))
        this.update({
          actionError:
            "Browser notifications could not be enabled. In-app notifications remain available.",
        });
    }
  };
  private showBrowser(item: Notification, epoch: number) {
    if (
      !this.owned(epoch) ||
      typeof window === "undefined" ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted"
    )
      return;
    try {
      const notification = new window.Notification(item.title, {
        body: item.message,
        icon: "/logo.svg",
        tag: item.id,
      });
      this.desktop.add(notification);
      const timer = setTimeout(() => {
        notification.close();
        this.desktop.delete(notification);
        this.desktopTimers.delete(timer);
      }, 5000);
      this.desktopTimers.add(timer);
      notification.onclick = () => {
        if (this.owned(epoch)) {
          window.focus();
          void this.openDestination(item.id).then(destination => {
            if (destination && this.owned(epoch))
              window.dispatchEvent(new CustomEvent("spotibuds:navigate", { detail: destination }));
          });
        }
        notification.close();
      };
    } catch {
      this.update({
        actionError:
          "Browser notifications are unavailable. Your in-app notifications are still saved.",
      });
    }
  }
}
export const notificationStore = new NotificationStore();

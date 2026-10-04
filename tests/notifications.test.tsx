import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification, NotificationCommandResult, NotificationResponse } from "../src/lib/api";
import type { NotificationHandlers } from "../src/lib/notificationHub";
const session = vi.hoisted(() => ({ owner: "", generation: 0, router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => session.router }));
vi.mock("../src/lib/session", () => ({
  getSessionGeneration: () => session.generation,
  ensureAccessToken: async () => "validated-access",
  logoutSession: vi.fn(),
  loginSession: vi.fn(),
  refreshSession: vi.fn(),
  registerRequest: () => () => undefined,
  clearSession: vi.fn(),
  getAccessToken: () => (session.owner ? "validated-access" : null),
  getSessionUser: () => (session.owner ? { id: session.owner } : null),
  SESSION_EVENT: "test:session",
}));
import { NotificationStore } from "../src/lib/notificationStore";
import { NotificationProvider } from "../src/contexts/NotificationContext";
import { ToastContainer } from "../src/components/ui/Toast";
import NotificationDropdown from "../src/components/ui/NotificationDropdown";
import NotificationsPage from "../src/app/notifications/page";
import {
  notificationDestination,
  safeNotificationPath,
  validNotification,
} from "../src/lib/notificationState";
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const note = (
  id: number,
  status: Notification["status"] = "Unread",
  owner = alice
): Notification => ({
  id: id.toString(16).padStart(24, "0"),
  targetUserId: owner,
  type: "Other",
  status,
  title: `Notice ${id}`,
  message: `Body ${id}`,
  data: {},
  createdAt: new Date(Date.UTC(2026, 9, 4, 0, 0, id)).toISOString(),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
let records: Notification[];
let store: NotificationStore;
let handlers: NotificationHandlers;
const snapshot = (items = records, owner = alice): NotificationResponse => {
  const all = items.filter(item => item.targetUserId === owner);
  return {
    notifications: all,
    totalCount: all.length,
    unreadCount: all.filter(item => item.status === "Unread").length,
    limit: 50,
    skip: 0,
    nextBefore: null,
  };
};
const ack = (notification: Notification | null = null): NotificationCommandResult => ({
  message: "Saved",
  notification,
  totalCount: records.length,
  unreadCount: records.filter(item => item.status === "Unread").length,
  throughId: null,
  synchronizationPending: false,
});
const get = vi.fn();
const read = vi.fn();
const remove = vi.fn();
const readAll = vi.fn();
const removeAll = vi.fn();
const accept = vi.fn();
const decline = vi.fn();
const enable = vi.fn();
const disable = vi.fn();
const reconnect = vi.fn();
async function ready() {
  store.setOwner(alice);
  await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
}
function surfaces(page = false) {
  session.owner = alice;
  return render(
    <NotificationProvider store={store}>
      <NotificationDropdown userId={alice} isLoggedIn />
      {page && <NotificationsPage />}
    </NotificationProvider>
  );
}
function row(id: number) {
  return document.querySelector<HTMLElement>(`article[data-notification-id="${note(id).id}"]`)!;
}
afterEach(() => {
  cleanup();
  store?.setOwner(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(() => {
  records = [note(3), note(2), note(1, "Read")];
  session.owner = alice;
  session.generation = 0;
  get.mockReset().mockImplementation(async (owner: string) => snapshot(records, owner));
  read.mockReset().mockImplementation(async (id: string) => {
    records = records.map(item =>
      item.id === id ? { ...item, status: "Read", readAt: "2026-10-04T10:00:00Z" } : item
    );
    return ack(records.find(item => item.id === id)!);
  });
  remove.mockReset().mockImplementation(async (id: string) => {
    records = records.filter(item => item.id !== id);
    return ack();
  });
  readAll.mockReset().mockImplementation(async (_owner: string, boundary: string) => {
    records = records.map(item =>
      item.id <= boundary && item.status === "Unread" ? { ...item, status: "Read" } : item
    );
    return ack();
  });
  removeAll.mockReset().mockImplementation(async (_owner: string, boundary: string) => {
    records = records.filter(item => item.id > boundary);
    return ack();
  });
  accept.mockReset().mockResolvedValue({});
  decline.mockReset().mockResolvedValue({});
  enable.mockReset().mockResolvedValue(undefined);
  disable.mockReset().mockResolvedValue(undefined);
  reconnect.mockReset().mockResolvedValue(undefined);
  store = new NotificationStore({
    api: {
      getNotifications: get,
      markAsRead: read,
      deleteNotification: remove,
      markAllAsRead: readAll,
      deleteAllNotifications: removeAll,
    },
    social: { acceptFriendRequest: accept, declineFriendRequest: decline },
    hub: {
      setHandlers: value => {
        handlers = value;
      },
      removeHandlers: vi.fn(),
      enableConnection: enable,
      disableConnection: disable,
      reconnect,
    },
    generation: () => session.generation,
  });
});
describe("canonical notification synchronization", () => {
  it("does not decrement unread count when deleting an already read notification", async () => {
    surfaces();
    const bell = await screen.findByRole("button", { name: "Notifications" });
    await waitFor(() => expect(bell.textContent).toBe("2"));
    fireEvent.click(bell);
    fireEvent.click(within(row(1)).getByRole("button", { name: "Delete notification" }));
    await waitFor(() => expect(row(1)).toBeNull());
    expect(bell.textContent).toBe("2");
    expect(session.router.push).not.toHaveBeenCalled();
  });
  it("updates both surfaces after a confirmed read without a self hub event", async () => {
    surfaces(true);
    await screen.findByRole("heading", { name: "Notice 3" });
    fireEvent.click(within(row(3)).getByRole("button", { name: "Mark as read" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" }).textContent).toBe("1")
    );
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getAllByRole("heading", { name: "Notice 3" })).toHaveLength(2);
    expect(
      document.querySelectorAll(
        `article[data-notification-id="${note(3).id}"] button[aria-label="Mark as read"]`
      )
    ).toHaveLength(0);
  });
  it("ignores a delayed snapshot and old hub callbacks after switching accounts", async () => {
    const old = deferred<NotificationResponse>();
    get.mockImplementation((owner: string) =>
      owner === alice ? old.promise : Promise.resolve(snapshot([note(4, "Unread", bob)], bob))
    );
    store.setOwner(alice);
    const obsolete = handlers;
    session.generation++;
    store.setOwner(bob);
    await waitFor(() => expect(store.getSnapshot().notifications[0]?.targetUserId).toBe(bob));
    old.resolve(snapshot());
    obsolete.onNewNotification?.(note(9));
    obsolete.onUnreadCountUpdate?.(99);
    await old.promise;
    expect(store.getSnapshot().ownerId).toBe(bob);
    expect(store.getSnapshot().notifications.map(item => item.id)).toEqual([note(4).id]);
    expect(store.getSnapshot().unreadCount).toBe(1);
  });
  it("clears ownership synchronously and rejects pending command acknowledgements on logout", async () => {
    await ready();
    const held = deferred<NotificationCommandResult>();
    read.mockReturnValue(held.promise);
    const command = store.markAsRead(note(3).id);
    session.generation++;
    store.setOwner(null);
    held.resolve(ack(note(3, "Read")));
    expect(await command).toBe(false);
    expect(store.getSnapshot().notifications).toEqual([]);
    expect(store.getSnapshot().unreadCount).toBeNull();
  });
  it("does not delay the initial saved snapshot behind realtime startup", async () => {
    const held = deferred<void>();
    enable.mockReturnValue(held.promise);
    await ready();
    expect(store.getSnapshot().notifications).toHaveLength(3);
    held.resolve();
  });
  it("does not overwrite a newer canonical event with a held initial snapshot", async () => {
    const held = deferred<NotificationResponse>();
    get.mockReturnValueOnce(held.promise);
    store.setOwner(alice);
    records = [note(4), ...records];
    handlers.onNewNotification?.(note(4));
    held.resolve(snapshot(records.slice(1)));
    await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
    expect(store.getSnapshot().notifications[0].id).toBe(note(4).id);
    expect(store.getSnapshot().unreadCount).toBe(3);
  });
  it("deduplicates canonical events without regressing Read or guessing advisory counts", async () => {
    await ready();
    const incoming = vi.fn();
    store.subscribeIncoming(incoming);
    handlers.onNewNotification?.(note(1));
    expect(store.getSnapshot().notifications.find(item => item.id === note(1).id)?.status).toBe(
      "Read"
    );
    records = [note(4), ...records];
    handlers.onNewNotification?.(note(4));
    handlers.onNewNotification?.(note(4));
    handlers.onUnreadCountUpdate?.(999);
    expect(store.getSnapshot().notifications.filter(item => item.id === note(4).id)).toHaveLength(
      1
    );
    expect(incoming).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().unreadCount).toBe(2);
    await store.refresh();
    expect(store.getSnapshot().unreadCount).toBe(3);
  });
  it("catches up authoritative read/delete state on reconnect", async () => {
    await ready();
    records = [note(2, "Read")];
    handlers.onConnectionStateChange?.("Reconnecting" as never);
    handlers.onConnectionStateChange?.("Connected" as never);
    await waitFor(() => expect(store.getSnapshot().unreadCount).toBe(0));
    expect(store.getSnapshot().notifications).toEqual(records);
  });
  it("shows command failure and retains unread state without navigating", async () => {
    records[0] = { ...records[0], type: "Message", data: { chatId: note(7).id } };
    read.mockRejectedValue(new Error("Controlled read outage"));
    surfaces();
    await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(within(row(3)).getByRole("button", { name: "Open notification" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Controlled read outage");
    expect(store.getSnapshot().unreadCount).toBe(2);
    expect(session.router.push).not.toHaveBeenCalled();
  });
  it("treats a committed ACK with unavailable synchronization as saved, with visible retry", async () => {
    await ready();
    get.mockRejectedValue(new Error("Snapshot unavailable"));
    read.mockResolvedValue({
      ...ack(note(3, "Read")),
      unreadCount: null,
      totalCount: null,
      synchronizationPending: true,
    });
    expect(await store.markAsRead(note(3).id)).toBe(true);
    expect(store.getSnapshot().notifications[0].status).toBe("Read");
    expect(store.getSnapshot().unreadCount).toBe(2);
    expect(store.getSnapshot().synced).toBe(false);
    expect(store.getSnapshot().actionError).toBe("");
    expect(store.getSnapshot().error).toBe("Snapshot unavailable");
  });
  it("captures bulk-read cutoff and preserves an arriving unread notice", async () => {
    await ready();
    const held = deferred<NotificationCommandResult>();
    readAll.mockReturnValue(held.promise);
    const command = store.bulk("read");
    records = [note(4), ...records.map(item => ({ ...item, status: "Read" as const }))];
    handlers.onNewNotification?.(note(4));
    held.resolve(ack());
    expect(await command).toBe(true);
    expect(readAll).toHaveBeenCalledWith(alice, note(3).id);
    expect(store.getSnapshot().notifications[0].status).toBe("Unread");
    expect(store.getSnapshot().unreadCount).toBe(1);
  });
  it("captures bulk-delete cutoff and preserves a later arrival", async () => {
    await ready();
    const held = deferred<NotificationCommandResult>();
    removeAll.mockReturnValue(held.promise);
    const command = store.bulk("dismiss");
    records = [note(4)];
    handlers.onNewNotification?.(note(4));
    held.resolve(ack());
    await command;
    expect(removeAll).toHaveBeenCalledWith(alice, note(3).id);
    expect(store.getSnapshot().notifications).toEqual(records);
  });
  it("prevents repeated concurrent mutation of one notice", async () => {
    await ready();
    const held = deferred<NotificationCommandResult>();
    read.mockReturnValue(held.promise);
    const command = store.markAsRead(note(3).id);
    expect(await store.markAsRead(note(3).id)).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
    held.resolve(ack(note(3, "Read")));
    await command;
  });
  it("paginates using the stable owned cursor and deduplicates the common page boundary", async () => {
    records = Array.from({ length: 75 }, (_, index) => note(75 - index));
    get.mockImplementation(
      async (_owner: string, _limit: number, _skip: number, before?: string) => ({
        ...snapshot(),
        notifications: before ? records.slice(49) : records.slice(0, 50),
        nextBefore: before ? null : records[49].id,
      })
    );
    await ready();
    expect(store.getSnapshot().notifications).toHaveLength(50);
    await store.loadMore();
    expect(get).toHaveBeenLastCalledWith(alice, 50, 0, records[49].id);
    expect(store.getSnapshot().notifications).toHaveLength(75);
    expect(store.getSnapshot().notifications.at(-1)?.id).toBe(note(1).id);
  });
  it("exposes failed initial load without a false empty-success message", async () => {
    get.mockRejectedValue(new Error("Inbox unavailable"));
    surfaces(true);
    await screen.findByRole("alert");
    expect(screen.queryByText("No notifications yet")).toBeNull();
    expect(store.getSnapshot().unreadCount).toBeNull();
    get.mockResolvedValue(snapshot());
    fireEvent.click(screen.getByRole("button", { name: "Retry notifications" }));
    await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
  });
  it("keeps Read pending friend requests actionable and uses the parent command only", async () => {
    records = [
      {
        ...note(1, "Read"),
        type: "FriendRequest",
        sourceUserId: bob,
        data: { requestId: note(10).id },
      },
    ];
    accept.mockImplementation(async () => {
      records = [{ ...records[0], status: "Handled" }];
      return {};
    });
    surfaces(true);
    const action = await screen.findByRole("button", { name: "Accept" });
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
    fireEvent.click(action);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).toBeNull());
    expect(accept).toHaveBeenCalledWith(note(10).id, alice);
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText("Resolved")).toBeTruthy();
  });
  it("refreshes a stale friendship action while preserving its error", async () => {
    records = [{ ...note(1), type: "FriendRequest", data: { requestId: note(10).id } }];
    await ready();
    decline.mockImplementation(async () => {
      records = [{ ...records[0], status: "Handled" }];
      throw new Error("This request has already changed.");
    });
    expect(await store.respondToFriendRequest(records[0], "decline")).toBe(false);
    expect(store.getSnapshot().notifications[0].status).toBe("Handled");
    expect(store.getSnapshot().actionError).toBe("This request has already changed.");
  });
  it("opens and closes the inbox using keyboard controls and restores bell focus", async () => {
    surfaces();
    await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
    const bell = screen.getByRole("button", { name: "Notifications" });
    fireEvent.click(bell);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Notification inbox" })).toBeNull();
    expect(document.activeElement).toBe(bell);
  });
  it("requests browser permission only from opt-in and deduplicates canonical desktop alerts", async () => {
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    const closed = vi.fn();
    const shown = vi.fn();
    class DesktopNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = requestPermission;
      close = closed;
      onclick: () => void = () => undefined;
      constructor(title: string, options: NotificationOptions) {
        shown(title, options);
      }
    }
    vi.stubGlobal("Notification", DesktopNotification);
    surfaces();
    await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "Enable browser notifications" }));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    DesktopNotification.permission = "granted";
    handlers.onNewNotification?.(note(4));
    handlers.onNewNotification?.(note(4));
    expect(shown).toHaveBeenCalledTimes(1);
    expect(shown.mock.calls[0][1].tag).toBe(note(4).id);
    store.setOwner(null);
    expect(closed).toHaveBeenCalledTimes(1);
  });
  it("rejects an open and successful command if ownership changes during its follow-up refresh", async () => {
    records[0] = { ...records[0], type: "Follow", sourceUserId: bob, actionUrl: `/user/${bob}` };
    await ready();
    const held = deferred<NotificationResponse>();
    get.mockReturnValueOnce(held.promise);
    const opening = store.openDestination(note(3).id);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    session.generation++;
    store.setOwner(null);
    held.resolve(snapshot());
    expect(await opening).toBeNull();
    expect(store.getSnapshot().ownerId).toBeNull();
  });
  it("opens the latest privacy-projected canonical ACK destination rather than the old row link", async () => {
    records[0] = { ...records[0], type: "Follow", sourceUserId: bob, actionUrl: `/user/${bob}` };
    await ready();
    read.mockImplementation(async (id: string) => {
      records = records.map(item =>
        item.id === id ? { ...item, status: "Read" as const, actionUrl: `/user/${alice}` } : item
      );
      return ack(records[0]);
    });
    expect(await store.openDestination(note(3).id)).toBe(`/user/${alice}`);
  });
  it("the Open control rechecks account ownership after its awaited destination resolves", async () => {
    records[0] = { ...records[0], type: "Message", data: { chatId: note(7).id } };
    surfaces();
    await waitFor(() => expect(store.getSnapshot().synced).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const held = deferred<string | null>();
    vi.spyOn(store, "openDestination").mockReturnValue(held.promise);
    fireEvent.click(within(row(3)).getByRole("button", { name: "Open notification" }));
    session.generation++;
    await act(async () => {
      store.setOwner(null);
      held.resolve(`/chat/${note(7).id}`);
    });
    expect(session.router.push).not.toHaveBeenCalled();
  });
  it("removes authoritative absent read-ACK rows without opening a dismissed notice", async () => {
    await ready();
    records = records.filter(item => item.id !== note(3).id);
    read.mockResolvedValue(ack(null));
    get.mockRejectedValue(new Error("Snapshot unavailable"));
    expect(await store.openDestination(note(3).id)).toBeNull();
    expect(store.getSnapshot().notifications.some(item => item.id === note(3).id)).toBe(false);
    expect(store.getSnapshot().unreadCount).toBe(1);
  });
  it("retains the prior row for a null unsynchronized ACK and does not open an unverified link", async () => {
    records[0] = { ...records[0], type: "Follow", sourceUserId: bob, actionUrl: `/user/${bob}` };
    await ready();
    read.mockResolvedValue({
      ...ack(null),
      totalCount: null,
      unreadCount: null,
      synchronizationPending: true,
    });
    get.mockRejectedValue(new Error("Snapshot unavailable"));
    expect(await store.openDestination(note(3).id)).toBeNull();
    expect(store.getSnapshot().notifications[0].status).toBe("Unread");
    expect(store.getSnapshot().unreadCount).toBe(2);
    expect(store.getSnapshot().error).toBe("Snapshot unavailable");
  });
  it("keeps older than 500 records reachable in bounded cursor windows", async () => {
    records = Array.from({ length: 525 }, (_, index) => note(525 - index));
    get.mockImplementation(
      async (_owner: string, limit: number, _skip: number, before?: string) => {
        if (limit === 1)
          return { ...snapshot(), notifications: records.slice(0, 1), nextBefore: records[0].id };
        const offset = before ? records.findIndex(item => item.id === before) + 1 : 0;
        const rows = records.slice(offset, offset + 50);
        return {
          ...snapshot(),
          notifications: rows,
          nextBefore: offset + 50 < records.length ? rows.at(-1)!.id : null,
        };
      }
    );
    await ready();
    for (let count = 0; count < 9; count++) await store.loadMore();
    expect(store.getSnapshot().notifications).toHaveLength(500);
    expect(store.getSnapshot().hasMore).toBe(true);
    await store.loadMore();
    expect(store.getSnapshot().showingOlder).toBe(true);
    expect(store.getSnapshot().notifications).toHaveLength(25);
    expect(store.getSnapshot().notifications.at(-1)?.id).toBe(note(1).id);
    expect(store.getSnapshot().hasMore).toBe(false);
    await store.bulk("read");
    expect(readAll).toHaveBeenLastCalledWith(alice, note(525).id);
    expect(store.getSnapshot().unreadCount).toBe(0);
    await store.returnToLatest();
    expect(store.getSnapshot().showingOlder).toBe(false);
    expect(store.getSnapshot().notifications[0].id).toBe(note(525).id);
  });
  it("uses canonical privacy-aware and common-post links before fallback data", () => {
    expect(
      notificationDestination({
        ...note(1),
        type: "Follow",
        sourceUserId: bob,
        actionUrl: `/user/${alice}`,
      })
    ).toBe(`/user/${alice}`);
    expect(
      notificationDestination({
        ...note(1),
        type: "Reaction",
        data: { postId: "viewer-common", actionPostId: "author-weekly" },
        actionUrl: "/feed/post/author-weekly",
      })
    ).toBe("/feed/post/author-weekly");
    expect(
      notificationDestination({
        ...note(1),
        type: "Reaction",
        data: { postId: "viewer-common", actionPostId: "author-weekly" },
      })
    ).toBe("/feed/post/author-weekly");
    expect(
      notificationDestination({
        ...note(1),
        type: "FriendRequestAccepted",
        sourceUserId: bob,
        actionUrl: "/friends",
      })
    ).toBe("/friends");
    expect(safeNotificationPath("/feed/post/%2E%2E")).toBe(false);
    expect(safeNotificationPath("/feed/post/%ZZ")).toBe(false);
  });
  it("does not resurrect a dismissed notice from a delayed duplicate creation event", async () => {
    await ready();
    await store.dismiss(note(3).id);
    handlers.onNewNotification?.(note(3));
    expect(store.getSnapshot().notifications.some(item => item.id === note(3).id)).toBe(false);
  });
  it("retains failed deletion and allows a confirmed retry", async () => {
    await ready();
    remove.mockRejectedValueOnce(new Error("Controlled delete outage"));
    expect(await store.dismiss(note(3).id)).toBe(false);
    expect(store.getSnapshot().notifications[0].id).toBe(note(3).id);
    expect(store.getSnapshot().unreadCount).toBe(2);
    expect(await store.dismiss(note(3).id)).toBe(true);
    expect(store.getSnapshot().notifications).toHaveLength(2);
    expect(store.getSnapshot().unreadCount).toBe(1);
  });
  it("does not apply stale command counts over a newer creation event", async () => {
    await ready();
    const held = deferred<NotificationCommandResult>();
    read.mockReturnValue(held.promise);
    const command = store.markAsRead(note(3).id);
    records = [
      note(4),
      ...records.map(item =>
        item.id === note(3).id ? { ...item, status: "Read" as const } : item
      ),
    ];
    handlers.onNewNotification?.(note(4));
    held.resolve({ ...ack(note(3, "Read")), unreadCount: 1, totalCount: 3 });
    await command;
    expect(store.getSnapshot().unreadCount).toBe(2);
    expect(store.getSnapshot().notifications[0].id).toBe(note(4).id);
  });
  it("stacks long notification toasts with named independent action and dismiss controls", async () => {
    const open = vi.fn();
    const dismiss = vi.fn();
    const longText = "x".repeat(2000);
    render(
      <ToastContainer
        toasts={[
          {
            id: "one",
            message: longText,
            type: "info",
            action: { label: "Open notification", onClick: open },
          },
          { id: "two", message: "Another notice", type: "info" },
        ]}
        onRemoveToast={dismiss}
      />
    );
    const notices = screen.getAllByRole("status");
    expect(notices).toHaveLength(2);
    expect(notices[0].className).not.toContain("fixed");
    expect(screen.getByText(longText).className).toContain("[overflow-wrap:anywhere]");
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(open).not.toHaveBeenCalled();
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith("one"));
  });
  it("clears toast expiry and dismiss callbacks when the owning presentation unmounts", async () => {
    const dismissed = vi.fn();
    vi.useFakeTimers();
    const view = render(
      <ToastContainer
        toasts={[{ id: "one", message: "Notice", type: "info" }]}
        onRemoveToast={dismissed}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    view.unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(dismissed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("startup performs only the bounded raced catch-up without a covered debounce fetch", async () => {
    vi.useFakeTimers();
    enable.mockImplementation(async () => {
      handlers.onUnreadCountUpdate?.(2);
      handlers.onConnectionStateChange?.("Connected" as never);
    });
    store.setOwner(alice);
    await store.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(get).toHaveBeenCalledTimes(2);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().synced).toBe(true);
  });
  it("a command and its canonical invalidations share one confirmed snapshot fetch", async () => {
    await ready();
    const before = get.mock.calls.length;
    vi.useFakeTimers();
    read.mockImplementation(async () => {
      records = records.map(item =>
        item.id === note(3).id ? { ...item, status: "Read" as const } : item
      );
      handlers.onNotificationMarkedRead?.(note(3).id);
      handlers.onNotificationsChanged?.({ userId: alice });
      handlers.onUnreadCountUpdate?.(1);
      return ack(records[0]);
    });
    await store.markAsRead(note(3).id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(get.mock.calls.length - before).toBe(1);
    expect(store.getSnapshot().unreadCount).toBe(1);
  });
  it("preserves a newer invalidation queued by a listener while the prior snapshot is accepted", async () => {
    await ready();
    const before = get.mock.calls.length;
    vi.useFakeTimers();
    let arrived = false;
    const unsubscribe = store.subscribe(() => {
      if (store.getSnapshot().synced && !arrived) {
        arrived = true;
        records = [note(4), ...records];
        handlers.onNewNotification?.(note(4));
      }
    });
    handlers.onUnreadCountUpdate?.(2);
    await store.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(get.mock.calls.length - before).toBe(2);
    expect(store.getSnapshot().notifications[0].id).toBe(note(4).id);
    expect(store.getSnapshot().unreadCount).toBe(3);
    expect(store.getSnapshot().synced).toBe(true);
    unsubscribe();
  });
  it("allows only valid canonical owners, active IDs and supported local destinations", () => {
    expect(validNotification({ ...note(1), id: "synthetic_temp" }, alice)).toBe(false);
    expect(validNotification(note(1, "Unread", bob), alice)).toBe(false);
    expect(validNotification({ ...note(1), dismissedAt: new Date().toISOString() }, alice)).toBe(
      false
    );
    expect(validNotification({ ...note(1), expiresAt: "2000-01-01T00:00:00Z" }, alice)).toBe(false);
    expect(notificationDestination({ ...note(1), actionUrl: "//evil.test" })).toBeNull();
    expect(notificationDestination({ ...note(1), actionUrl: "javascript:alert(1)" })).toBeNull();
    const reaction = {
      ...note(1),
      type: "Reaction" as const,
      data: { postId: "recent_song:abc/def" },
    };
    expect(notificationDestination(reaction)).toBe("/feed/post/recent_song%3Aabc%2Fdef");
    expect(safeNotificationPath(notificationDestination(reaction)!)).toBe(true);
    expect(notificationDestination({ ...note(1), type: "Follow", sourceUserId: bob })).toBe(
      `/user/${bob}`
    );
    expect(
      notificationDestination({ ...note(1), type: "Reaction", data: { postId: ".." } })
    ).toBeNull();
  });
});

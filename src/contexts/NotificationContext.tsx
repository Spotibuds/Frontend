"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";
import { getAccessToken, getSessionUser, SESSION_EVENT } from "@/lib/session";
import { notificationStore, NotificationStore } from "@/lib/notificationStore";

const NotificationContext = createContext<NotificationStore | null>(null);
export function NotificationProvider({
  children,
  store = notificationStore,
}: {
  children: React.ReactNode;
  store?: NotificationStore;
}) {
  useDeferredEffect(() => {
    const syncOwner = () => store.setOwner(getAccessToken() ? getSessionUser()?.id || null : null);
    syncOwner();
    window.addEventListener(SESSION_EVENT, syncOwner);
    return () => {
      window.removeEventListener(SESSION_EVENT, syncOwner);
      store.setOwner(null);
    };
  }, [store]);
  return <NotificationContext.Provider value={store}>{children}</NotificationContext.Provider>;
}
export function useNotificationStore() {
  const store = useContext(NotificationContext);
  if (!store) throw new Error("Notifications require a NotificationProvider.");
  return store;
}
export function useNotifications() {
  const store = useNotificationStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...state, store };
}

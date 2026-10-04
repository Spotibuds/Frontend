"use client";

import { useSyncExternalStore } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";

// One clock shared by feed cards; inactive pages do not retain timers.
const listeners = new Set<() => void>();
let now: number | null = null;
let interval: ReturnType<typeof setInterval> | undefined;
const tick = () => {
  now = Date.now();
  listeners.forEach(notify => notify());
};
function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) {
    now = Date.now();
    interval = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    listeners.delete(notify);
    if (!listeners.size) {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      now = null;
    }
  };
}
const snapshot = () => now;
const serverSnapshot = () => null;

export default function RelativeTime({
  value,
  prefix = "",
  className,
}: {
  value: string;
  prefix?: string;
  className?: string;
}) {
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const exact = new Date(timestamp).toISOString();
  return (
    <time
      dateTime={exact}
      title={exact.replace("T", " ").replace("Z", " UTC")}
      className={className}
    >
      {prefix}
      {now === null ? "recently" : formatRelativeTime(value, now)}
    </time>
  );
}

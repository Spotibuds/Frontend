import { useCallback, useEffect, useRef, useState } from "react";
import { userApi, type FriendshipStatus } from "@/lib/api";
import { eventBus } from "@/lib/eventBus";
import { useDeferredEffect } from "./useDeferredEffect";

export function useFriendshipStatus(userId?: string, targetId?: string, isConnected = false) {
  const [snapshot, setSnapshot] = useState<{ key: string; status: FriendshipStatus } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const scope = useRef({ active: true, version: 0, key: "" });
  const key = userId && targetId && userId !== targetId ? `${userId}:${targetId}` : "";
  const refresh = useCallback(async () => {
    if (!userId || !targetId || userId === targetId) return;
    const owner = `${userId}:${targetId}`;
    if (!scope.current.active || scope.current.key !== owner) return;
    const version = ++scope.current.version;
    setLoading(true);
    try {
      const status = await userApi.getFriendshipStatus(userId, targetId);
      if (
        scope.current.active &&
        scope.current.key === owner &&
        scope.current.version === version
      ) {
        setSnapshot({ key: owner, status });
        setError("");
      }
    } catch {
      if (scope.current.active && scope.current.key === owner && scope.current.version === version)
        setError("Friendship status could not be loaded. Please retry.");
    } finally {
      if (scope.current.active && scope.current.key === owner && scope.current.version === version)
        setLoading(false);
    }
  }, [userId, targetId]);
  useDeferredEffect(() => {
    const owner = scope.current;
    owner.active = true;
    owner.key = key;
    owner.version++;
    setSnapshot(null);
    setError("");
    setLoading(false);
    if (key) void refresh();
    return () => {
      owner.active = false;
      owner.version++;
    };
  }, [key, refresh]);
  useEffect(() => {
    const changed = (...ids: unknown[]) => {
      if (key && ids.includes(userId) && ids.includes(targetId)) void refresh();
    };
    eventBus.on("friendshipStatusChanged", changed);
    return () => eventBus.off("friendshipStatusChanged", changed);
  }, [key, userId, targetId, refresh]);
  useDeferredEffect(() => {
    if (isConnected && key) void refresh();
  }, [isConnected, key, refresh]);
  // A route change cannot expose the preceding user's relationship before effect cleanup.
  return { status: snapshot?.key === key ? snapshot.status : null, error, loading, refresh };
}

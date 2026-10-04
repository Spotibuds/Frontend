"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";
import { userApi, identityApi, FriendRequest } from "@/lib/api";
import { useFriendHub } from "@/hooks/useFriendHub";
import { eventBus } from "@/lib/eventBus";

interface FriendRequestsProps {
  className?: string;
}

export default function FriendRequests({ className = "" }: FriendRequestsProps) {
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const lifetime = useRef({ version: 0 });
  const { isConnected } = useFriendHub({ userId: currentUser?.id });

  // Initialize friend hub for real-time updates

  const loadFriendRequests = useCallback(async (userId: string) => {
    const version = ++lifetime.current.version;
    try {
      const requests = await userApi.getPendingFriendRequests(userId);
      if (version !== lifetime.current.version) return;
      setFriendRequests(requests);
      setError("");
    } catch (error) {
      if (version === lifetime.current.version)
        setError(
          error instanceof Error
            ? error.message
            : "Friend requests could not be loaded. Please retry."
        );
    } finally {
      if (version === lifetime.current.version) setIsLoading(false);
    }
  }, []);

  useDeferredEffect(() => {
    const user = identityApi.getCurrentUser();
    setCurrentUser(user);

    if (user) {
      void loadFriendRequests(user.id);
    } else {
      setIsLoading(false);
    }
    const owner = lifetime.current;
    return () => {
      owner.version++;
    };
  }, [loadFriendRequests]);

  useEffect(() => {
    const changed = (...ids: unknown[]) => {
      if (currentUser && ids.includes(currentUser.id)) void loadFriendRequests(currentUser.id);
    };
    eventBus.on("friendshipStatusChanged", changed);
    return () => eventBus.off("friendshipStatusChanged", changed);
  }, [currentUser, loadFriendRequests]);
  useDeferredEffect(() => {
    if (isConnected && currentUser) void loadFriendRequests(currentUser.id);
  }, [isConnected, currentUser, loadFriendRequests]);

  const finishProcessing = (id: string) =>
    setProcessing(previous => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });

  const handleAcceptRequest = async (requestId: string) => {
    if (!currentUser || processing.has(requestId)) return;
    setProcessing(previous => new Set([...previous, requestId]));

    try {
      await userApi.acceptFriendRequest(requestId, currentUser.id);
      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      eventBus.emit("friendshipStatusChanged", currentUser.id);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Friend request could not be accepted. Please retry."
      );
    } finally {
      finishProcessing(requestId);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!currentUser || processing.has(requestId)) return;
    setProcessing(previous => new Set([...previous, requestId]));

    try {
      await userApi.declineFriendRequest(requestId, currentUser.id);
      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      eventBus.emit("friendshipStatusChanged", currentUser.id);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Friend request could not be declined. Please retry."
      );
    } finally {
      finishProcessing(requestId);
    }
  };

  if (isLoading) {
    return (
      <Card className={`bg-gray-800/50 border-gray-700 ${className}`}>
        <CardHeader>
          <CardTitle className="text-white">Friend Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-400">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (friendRequests.length === 0 && !error) {
    return null; // Don't show the component if there are no requests
  }

  return (
    <Card className={`bg-gray-800/50 border-gray-700 ${className}`}>
      <CardHeader>
        <CardTitle className="text-white">Friend Requests ({friendRequests.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" className="text-red-300 mb-3">
            {error}{" "}
            <button onClick={() => currentUser && void loadFriendRequests(currentUser.id)}>
              Retry friend requests
            </button>
          </p>
        )}
        <div className="space-y-4">
          {friendRequests.map(request => (
            <div
              key={request.requestId}
              className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">
                    {request.requesterUsername.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium">{request.requesterUsername}</p>
                  <p className="text-gray-400 text-sm">
                    {new Date(request.requestedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  aria-label={`Accept friend request from ${request.requesterUsername}`}
                  disabled={processing.has(request.requestId)}
                  onClick={() => handleAcceptRequest(request.requestId)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
                >
                  Accept
                </Button>
                <Button
                  aria-label={`Decline friend request from ${request.requesterUsername}`}
                  disabled={processing.has(request.requestId)}
                  onClick={() => handleDeclineRequest(request.requestId)}
                  variant="outline"
                  className="border-gray-600 text-white hover:bg-gray-600 px-4 py-2 text-sm"
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

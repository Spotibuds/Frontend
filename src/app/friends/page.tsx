"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import MusicImage from "@/components/ui/MusicImage";
import { Toast } from "@/components/ui/Toast";
import { identityApi, userApi, FriendRequest, SentFriendRequest } from "@/lib/api";
import { useFriendHub } from "@/hooks/useFriendHub";
import { eventBus } from "@/lib/eventBus";

interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  displayName?: string;
  bio?: string;
  isPrivate?: boolean;
}

export default function FriendsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());
  const [processingFriends, setProcessingFriends] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<User | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; type: "success" | "error" | "info" }>
  >([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    // Longer timeout for better user feedback
    const timeout = type === "success" ? 4000 : type === "error" ? 6000 : 5000;
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, timeout);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const [outgoingRequests, setOutgoingRequests] = useState<SentFriendRequest[]>([]);
  const [incomingTargets, setIncomingTargets] = useState<Set<string>>(new Set());
  const lifetime = useRef({ active: true, loadVersion: 0, searchVersion: 0 });
  const {
    isConnected,
    connectionState,
    error: hubError,
    connect,
  } = useFriendHub({ userId: currentUser?.id });
  useEffect(() => {
    const owner = lifetime.current;
    owner.active = true;
    return () => {
      owner.active = false;
      owner.loadVersion++;
      owner.searchVersion++;
    };
  }, []);
  useDeferredEffect(() => {
    const user = identityApi.getCurrentUser();
    setCurrentUser(user);
    if (!user) {
      setLoading(false);
      setLoadError("Sign in to view your friends and requests.");
    }
  }, []);
  const loadAll = useCallback(async () => {
    if (!currentUser?.id) return;
    const version = ++lifetime.current.loadVersion;
    const results = await Promise.allSettled([
      userApi.getPendingFriendRequests(currentUser.id),
      userApi.getSentFriendRequests(currentUser.id),
      (async () => {
        const ids = await userApi.getFriends(currentUser.id);
        const profiles: User[] = [];
        for (let offset = 0; offset < ids.length; offset += 50)
          profiles.push(...(await userApi.getUserProfilesBatch(ids.slice(offset, offset + 50))));
        return profiles;
      })(),
    ]);
    if (!lifetime.current.active || version !== lifetime.current.loadVersion) return;
    const [incoming, outgoing, accepted] = results;
    if (incoming.status === "fulfilled") {
      setFriendRequests(incoming.value);
      setIncomingTargets(new Set(incoming.value.map(request => request.requesterId)));
    }
    if (outgoing.status === "fulfilled") {
      setOutgoingRequests(outgoing.value);
      setSentRequests(new Set(outgoing.value.map(request => request.addresseeId)));
    }
    if (accepted.status === "fulfilled") setFriends(accepted.value);
    const errors = results.filter(result => result.status === "rejected");
    setLoadError(
      errors.length ? "Some friends or requests could not be loaded. Please retry." : ""
    );
    setLoading(false);
  }, [currentUser]);
  useDeferredEffect(() => {
    if (currentUser?.id) {
      setLoading(true);
      void loadAll();
    }
  }, [currentUser?.id, loadAll]);
  useEffect(() => {
    const changed = (...ids: unknown[]) => {
      if (ids.includes(currentUser?.id)) void loadAll();
    };
    eventBus.on("friendshipStatusChanged", changed);
    return () => eventBus.off("friendshipStatusChanged", changed);
  }, [currentUser?.id, loadAll]);
  // Recover events missed while offline from authoritative REST state.
  useDeferredEffect(() => {
    if (isConnected) void loadAll();
  }, [isConnected, loadAll]);
  const loadFriends = loadAll;
  const loadFriendRequests = loadAll;
  const checkSentRequests = async (users: User[], version: number) => {
    if (!currentUser?.id) return;
    const statuses = await Promise.all(
      users.map(async user => ({
        id: user.id,
        status: await userApi.getFriendshipStatus(currentUser.id, user.id),
      }))
    );
    if (!lifetime.current.active || version !== lifetime.current.searchVersion) return;
    setSentRequests(
      new Set(
        statuses
          .filter(
            item => item.status.status === "pending" && item.status.requesterId === currentUser.id
          )
          .map(item => item.id)
      )
    );
    setIncomingTargets(
      new Set(
        statuses
          .filter(
            item => item.status.status === "pending" && item.status.requesterId !== currentUser.id
          )
          .map(item => item.id)
      )
    );
  };
  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    const version = ++lifetime.current.searchVersion;
    setIsSearching(true);
    try {
      const result = await userApi.searchUsers(query);
      if (!lifetime.current.active || version !== lifetime.current.searchVersion) return;
      const filtered = result.filter(
        user => user.id !== currentUser?.id && !friends.some(friend => friend.id === user.id)
      );
      setSearchResults(filtered);
      setHasSearched(true);
      await checkSentRequests(filtered, version);
    } catch {
      if (version === lifetime.current.searchVersion)
        addToast("Users could not be searched. Please retry.", "error");
    } finally {
      if (lifetime.current.active && version === lifetime.current.searchVersion)
        setIsSearching(false);
    }
  };
  const finishProcessing = (id: string) =>
    setProcessingRequests(previous => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!currentUser?.id || processingRequests.has(targetUserId)) return;
    setProcessingRequests(previous => new Set([...previous, targetUserId]));
    try {
      await userApi.sendFriendRequest(currentUser.id, targetUserId);
      setSentRequests(previous => new Set([...previous, targetUserId]));
      addToast("Friend request sent.", "success");
      await loadAll();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Friend request could not be sent. Please retry.",
        "error"
      );
      await loadAll();
      const version = lifetime.current.searchVersion;
      await checkSentRequests(searchResults, version).catch(() => undefined);
    } finally {
      finishProcessing(targetUserId);
    }
  };
  const handleAcceptRequest = async (requestId: string) => {
    if (!currentUser?.id || processingRequests.has(requestId)) return;
    setProcessingRequests(previous => new Set([...previous, requestId]));
    try {
      await userApi.acceptFriendRequest(requestId, currentUser.id);
      setFriendRequests(previous => previous.filter(request => request.requestId !== requestId));
      addToast("Friend request accepted.", "success");
      await loadAll();
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Friend request could not be accepted. Please retry.",
        "error"
      );
      await loadAll();
    } finally {
      finishProcessing(requestId);
    }
  };
  const handleDeclineRequest = async (requestId: string) => {
    if (!currentUser?.id || processingRequests.has(requestId)) return;
    setProcessingRequests(previous => new Set([...previous, requestId]));
    try {
      await userApi.declineFriendRequest(requestId, currentUser.id);
      setFriendRequests(previous => previous.filter(request => request.requestId !== requestId));
      addToast("Friend request declined.", "success");
      await loadAll();
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Friend request could not be declined. Please retry.",
        "error"
      );
      await loadAll();
    } finally {
      finishProcessing(requestId);
    }
  };
  const handleCancelRequest = async (requestId: string) => {
    if (processingRequests.has(requestId)) return;
    setProcessingRequests(previous => new Set([...previous, requestId]));
    try {
      await userApi.cancelFriendRequest(requestId);
      setOutgoingRequests(previous => previous.filter(request => request.requestId !== requestId));
      addToast("Friend request cancelled.", "success");
      await loadAll();
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Friend request could not be cancelled. Please retry.",
        "error"
      );
      await loadAll();
    } finally {
      finishProcessing(requestId);
    }
  };
  const handleRemoveFriend = async (friendId: string) => {
    if (!currentUser?.id || processingFriends.has(friendId)) return;
    setRemoveError("");
    setProcessingFriends(previous => new Set([...previous, friendId]));
    try {
      const friendship = await userApi.getFriendshipStatus(currentUser.id, friendId);
      if (!friendship.friendshipId)
        throw new Error("Friendship could not be found. Refresh and retry.");
      await userApi.removeFriend(friendship.friendshipId, currentUser.id);
      setRemoving(null);
      setFriends(previous => previous.filter(friend => friend.id !== friendId));
      addToast("Friend removed.", "success");
      await loadAll();
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : "Friend could not be removed. Retry."
      );
      addToast(
        error instanceof Error ? error.message : "Friend could not be removed. Please retry.",
        "error"
      );
      await loadAll();
    } finally {
      setProcessingFriends(previous => {
        const next = new Set(previous);
        next.delete(friendId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-shell">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Friends</h1>
                <p className="text-gray-400">
                  Manage your friends, friend requests, and discover new people
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
                ></div>
                <span className="text-sm text-gray-400">
                  {isConnected ? "Connected" : connectionState}
                </span>
              </div>
            </div>
          </div>

          {(hubError || connectionState === "Disconnected") && (
            <p role="alert" className="text-amber-300 mb-4">
              Live friend updates are disconnected. Your lists remain available.{" "}
              <button onClick={() => void connect().catch(() => undefined)}>Reconnect</button>
            </p>
          )}
          {loadError && (
            <p role="alert" className="text-red-300 mb-4">
              {loadError}{" "}
              <button
                onClick={() => {
                  setLoadError("");
                  void Promise.all([loadFriends(), loadFriendRequests()]);
                }}
              >
                Retry
              </button>
            </p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Friend Requests - Compact */}
            <div className="lg:col-span-1">
              <Card className="bg-gray-800">
                <div className="p-4">
                  <h2 className="text-lg font-semibold text-white mb-3">
                    Requests ({friendRequests.length})
                  </h2>
                  {friendRequests.length === 0 && !loadError ? (
                    <p className="text-gray-400 text-sm text-center py-4">No pending requests</p>
                  ) : (
                    <div className="space-y-3">
                      {friendRequests.map(request => (
                        <div
                          key={`request-${request.requestId}`}
                          className="flex items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                        >
                          <MusicImage
                            src={request.requesterAvatar}
                            alt={request.requesterUsername || "User"}
                            className="w-10 h-10 rounded-full"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">
                              {request.requesterUsername || "Unknown User"}
                            </p>
                            <p className="text-gray-400 text-xs">
                              {request.requestedAt
                                ? new Date(request.requestedAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "Unknown"}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button
                              onClick={() => handleAcceptRequest(request.requestId)}
                              aria-label={`Accept friend request from ${request.requesterUsername || "user"}`}
                              disabled={processingRequests.has(request.requestId)}
                              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ✓
                            </Button>
                            <Button
                              onClick={() => handleDeclineRequest(request.requestId)}
                              aria-label={`Decline friend request from ${request.requesterUsername || "user"}`}
                              disabled={processingRequests.has(request.requestId)}
                              className="px-3 py-1 text-xs bg-gray-700 text-red-300 hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
              <Card className="mt-4 bg-white/10 border-white/20">
                <div className="p-4">
                  <h2 className="text-lg font-semibold text-white mb-3">
                    Sent Requests ({outgoingRequests.length})
                  </h2>
                  {outgoingRequests.length === 0 && !loadError ? (
                    <p className="text-gray-400 text-sm">No outgoing requests</p>
                  ) : (
                    outgoingRequests.map(request => (
                      <div key={request.requestId} className="flex items-center gap-2 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white truncate">{request.addresseeUsername}</p>
                          <time className="text-xs text-gray-400" dateTime={request.requestedAt}>
                            {new Date(request.requestedAt).toLocaleDateString()}
                          </time>
                        </div>
                        <Button
                          aria-label={`Cancel friend request to ${request.addresseeUsername}`}
                          onClick={() => handleCancelRequest(request.requestId)}
                          disabled={processingRequests.has(request.requestId)}
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Friends & Search Combined */}
            <div className="lg:col-span-3">
              <Card className="bg-gray-800">
                <div className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <h2 className="text-xl font-semibold text-white">Friends ({friends.length})</h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Input
                        aria-label="Search users..."
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={e => {
                          lifetime.current.searchVersion++;
                          setSearchQuery(e.target.value);
                          setHasSearched(false);
                          setIsSearching(false);
                          if (!e.target.value.trim()) setSearchResults([]);
                        }}
                        onKeyPress={e => e.key === "Enter" && handleSearch()}
                        className="w-full sm:w-48 bg-white/10 border-white/20 text-white placeholder-gray-400 text-sm"
                      />
                      <Button
                        onClick={handleSearch}
                        disabled={isSearching || !searchQuery.trim()}
                        className="px-4 bg-primary text-primary-foreground hover:bg-purple-300 disabled:opacity-50 text-sm w-full sm:w-auto"
                      >
                        {isSearching ? "Searching…" : "Search"}
                      </Button>
                    </div>
                  </div>

                  {hasSearched && !isSearching && !searchResults.length && (
                    <p role="status" className="mb-4 text-sm text-gray-400">
                      No people found. Try another username.
                    </p>
                  )}
                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium text-white mb-3">Search Results</h3>
                      <div className="space-y-2">
                        {searchResults.map(user => (
                          <div
                            key={`search-${user.id}`}
                            className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg"
                          >
                            <MusicImage
                              src={user.avatarUrl}
                              alt={user.username}
                              className="w-10 h-10 rounded-full"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{user.username}</p>
                              <p className="text-gray-400 text-sm truncate">
                                {user.displayName || user.username}
                              </p>
                            </div>
                            <Button
                              onClick={() => handleSendFriendRequest(user.id)}
                              disabled={
                                friends.some(friend => friend.id === user.id) ||
                                sentRequests.has(user.id) ||
                                incomingTargets.has(user.id) ||
                                processingRequests.has(user.id)
                              }
                              className={`px-3 py-1 text-sm ${
                                friends.some(friend => friend.id === user.id) ||
                                sentRequests.has(user.id) ||
                                incomingTargets.has(user.id) ||
                                processingRequests.has(user.id)
                                  ? "bg-gray-600 cursor-not-allowed"
                                  : "bg-primary text-primary-foreground hover:bg-purple-300"
                              }`}
                            >
                              {friends.some(friend => friend.id === user.id)
                                ? "Friends"
                                : processingRequests.has(user.id)
                                  ? "Sending..."
                                  : sentRequests.has(user.id)
                                    ? "Request sent"
                                    : incomingTargets.has(user.id)
                                      ? "Incoming request"
                                      : "Add"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Friends List */}
                  {friends.length === 0 && !loadError ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                          />
                        </svg>
                      </div>
                      <p className="text-gray-400 mb-4">No friends yet</p>
                      <p className="text-gray-500 text-sm">
                        Search for users above to add them as friends
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {friends.map(friend => (
                        <div
                          key={`friend-${friend.id}`}
                          className="flex items-center gap-3 p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <MusicImage
                            src={friend.avatarUrl}
                            alt={friend.username}
                            className="w-12 h-12 rounded-full"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{friend.username}</p>
                            <p className="text-gray-400 text-sm">Friend</p>
                          </div>
                          <Button
                            onClick={() => {
                              setRemoving(friend);
                              setRemoveError("");
                            }}
                            disabled={processingFriends.has(friend.id)}
                            className="px-3 py-1 text-xs bg-gray-700 text-red-300 hover:bg-red-950 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingFriends.has(friend.id) ? "..." : "Remove"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>

        <Dialog
          open={Boolean(removing)}
          onClose={() => {
            if (!processingFriends.size) setRemoving(null);
          }}
          title="Remove friend?"
        >
          <p className="text-sm text-gray-300">
            Remove {removing?.username} from your friends? You can send a new friend request later.
          </p>
          {removeError && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {removeError}
            </p>
          )}
          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              disabled={Boolean(processingFriends.size)}
              onClick={() => setRemoving(null)}
            >
              Keep friend
            </Button>
            <Button
              variant="destructive"
              loading={Boolean(processingFriends.size)}
              onClick={() => {
                if (removing) void handleRemoveFriend(removing.id);
              }}
            >
              Remove friend
            </Button>
          </div>
        </Dialog>
        {/* Toast Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

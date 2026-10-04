"use client";
import { useDeferredEffect } from "@/hooks/useDeferredEffect";

import { useEffect, useState, useCallback, useRef } from "react";
import { useDialog } from "@/hooks/useDialog";
import Link from "next/link";

import { useParams, useRouter } from "next/navigation";
import MusicImage from "@/components/ui/MusicImage";

import { Button } from "@/components/ui/Button";
import {
  UserPlusIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { userApi, identityApi, type Artist, type User } from "@/lib/api";
import { Playlist } from "@/lib/playlist";
import { useFriendHub } from "@/hooks/useFriendHub";
import { useFriendshipStatus } from "@/hooks/useFriendshipStatus";

import { eventBus } from "@/lib/eventBus";

interface UserProfile {
  id: string;
  identityUserId: string;
  username: string;
  displayName?: string;
  bio?: string;
  email?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
  friendCount?: number;
  playlists?: { id: string }[];
  topArtists?: Array<{ name: string; count: number }>;
  // Enhanced: hydrated artist details
  hydratedTopArtists?: Array<{
    id: string;
    name: string;
    imageUrl?: string;
    count: number;
  }>;

  recentActivity?: {
    action: string;
    item: string;
    artist?: string;
    coverUrl?: string;
    time: string;
  }[];
  publicPlaylists?: Playlist[];
}

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.id as string;

  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [hydratedTopArtists, setHydratedTopArtists] = useState<
    Array<{ id: string; name: string; imageUrl?: string; count: number }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [isSavingFollow, setIsSavingFollow] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reactions, setReactions] = useState<
    Array<{
      toIdentityUserId: string;
      fromIdentityUserId: string;
      fromUserName?: string;
      emoji: string;
      createdAt: string;
      contextType?: string;
      songId?: string;
      songTitle?: string;
      postId?: string;
    }>
  >([]);
  const [isLoadingReactions, setIsLoadingReactions] = useState(false);

  // State for popup modals
  const [showFriendsPopup, setShowFriendsPopup] = useState(false);
  const [showPlaylistsPopup, setShowPlaylistsPopup] = useState(false);
  const [friendsList, setFriendsList] = useState<User[]>([]);
  const [playlistsList, setPlaylistsList] = useState<Playlist[]>([]);
  const [isLoadingPopup, setIsLoadingPopup] = useState(false);
  const [popupError, setPopupError] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [reactionsError, setReactionsError] = useState("");
  const profileRequest = useRef({ version: 0 });
  const friendsDialog = useDialog(showFriendsPopup, () => setShowFriendsPopup(false));
  const playlistsDialog = useDialog(showPlaylistsPopup, () => setShowPlaylistsPopup(false));

  // Initialize friend hub for real-time notifications
  const { isConnected } = useFriendHub({
    userId: currentUser?.id,
    autoConnect: !!currentUser?.id,
  });
  const {
    status: friendshipStatus,
    error: friendshipError,
    loading: friendshipLoading,
    refresh: loadFriendshipStatus,
  } = useFriendshipStatus(currentUser?.id, profileUser?.identityUserId, isConnected);

  const isOwnProfile = currentUser && profileUser && currentUser.id === profileUser.identityUserId;

  useDeferredEffect(() => {
    let active = true;
    setIsFollowing(null);
    setActionError("");
    if (currentUser && profileUser && currentUser.id !== profileUser.identityUserId) {
      void userApi.checkIfFollowing(currentUser.id, profileUser.identityUserId).then(
        following => {
          if (active) setIsFollowing(following);
        },
        error => {
          if (active)
            setActionError(
              error instanceof Error
                ? error.message
                : "Follow status could not be loaded. Reload to retry."
            );
        }
      );
    }
    return () => {
      active = false;
    };
  }, [currentUser, profileUser]);

  const handleFollow = async () => {
    if (!currentUser || !profileUser || isFollowing === null || isSavingFollow) return;
    setIsSavingFollow(true);
    setActionError("");
    try {
      if (isFollowing) await userApi.unfollowUser(currentUser.id, profileUser.identityUserId);
      else await userApi.followUser(currentUser.id, profileUser.identityUserId);
      setIsFollowing(!isFollowing);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Follow could not be saved. Please retry."
      );
    } finally {
      setIsSavingFollow(false);
    }
  };

  // Hydrate top artists with artist details (id, image)
  useEffect(() => {
    let active = true;
    const fetchArtistDetails = async () => {
      if (!profileUser?.topArtists || profileUser.topArtists.length === 0) {
        setHydratedTopArtists([]);
        return;
      }
      const musicApi = (await import("@/lib/api")).musicApi;
      const allArtists: Artist[] = await musicApi.getArtists().catch(() => []);
      if (!active) return;
      const hydrated = profileUser.topArtists.map((a: { name: string; count: number }) => {
        const found = allArtists.find(
          (art: Artist) => art.name.toLowerCase() === a.name.toLowerCase()
        );
        return {
          id: found?.id || "",
          name: a.name,
          imageUrl: found?.imageUrl,
          count: a.count,
        };
      });
      setHydratedTopArtists(hydrated);
    };
    void fetchArtistDetails();
    return () => {
      active = false;
    };
  }, [profileUser?.topArtists]);
  const loadReactions = useCallback(async (identityUserId: string) => {
    try {
      setIsLoadingReactions(true);
      setReactionsError("");
      const data = await userApi.getLatestReactions(identityUserId, 10, 0);
      setReactions(data);
    } catch (error) {
      setReactionsError(error instanceof Error ? error.message : "Reactions could not be loaded.");
    } finally {
      setIsLoadingReactions(false);
    }
  }, []);

  const loadUserProfile = useCallback(
    async (identifier: string, authenticatedUser?: { id: string; username: string } | null) => {
      const request = ++profileRequest.current.version;
      const unavailable: string[] = [];
      try {
        setIsLoading(true);
        setError(null);
        setDetailsError("");

        let userData: UserProfile | null = null;

        try {
          const userResult = await userApi.getUserProfile(identifier);
          userData = {
            id: userResult.id,
            identityUserId: identifier, // Use the identifier as identityUserId since that's what was passed
            username: userResult.username,
            displayName: userResult.displayName,
            bio: userResult.bio,
            email: userResult.email,
            avatarUrl: userResult.avatarUrl,
            isPrivate: userResult.isPrivate,
            playlists: undefined, // We don't have playlist details from getUserProfile anymore
          };
        } catch {
          try {
            const searchResults = await userApi.searchUsers(identifier);
            const userByUsername = searchResults.find(
              user => user.username.toLowerCase() === identifier.toLowerCase()
            );
            if (userByUsername) {
              const userResult = await userApi.getUserProfile(userByUsername.id);
              userData = {
                id: userResult.id,
                identityUserId: userByUsername.id, // Use the found user's id as identityUserId
                username: userResult.username,
                displayName: userResult.displayName,
                bio: userResult.bio,
                email: userResult.email,
                avatarUrl: userResult.avatarUrl,
                isPrivate: userResult.isPrivate,
                playlists: undefined, // We don't have playlist details from getUserProfile anymore
              };
            }
          } catch {
            // Username search failed, continue with null userData
          }
        }

        if (request !== profileRequest.current.version) return;
        if (!userData) {
          setError("User not found");
          setProfileUser(null);
          return;
        }

        // Use the passed user parameter - don't reference currentUser to avoid dependency issues
        const activeUser = authenticatedUser;

        // Fetch listening history for recent activity
        let recentActivity: {
          action: string;
          item: string;
          artist: string;
          coverUrl?: string;
          time: string;
        }[] = [];

        // Load recent activity for own profile or non-private users
        const shouldLoadActivity =
          activeUser &&
          (userData.identityUserId === activeUser.id || // Own profile
            !userData.isPrivate); // Public profile

        if (shouldLoadActivity) {
          try {
            const listeningHistory = await userApi.getListeningHistory(userData.identityUserId);
            // Transform listening history into recent activity format
            recentActivity = listeningHistory
              .slice(0, 10)
              .map(
                (item: {
                  songTitle?: string;
                  title?: string;
                  artist?: string | { name: string };
                  coverUrl?: string;
                  playedAt: string;
                }) => ({
                  action: "Listened to",
                  item: item.songTitle || item.title || "Unknown Song",
                  artist:
                    typeof item.artist === "string"
                      ? item.artist
                      : item.artist?.name || "Unknown Artist",
                  coverUrl: item.coverUrl,
                  time: new Date(item.playedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })
              );
          } catch (error) {
            console.error("Failed to load listening history:", error);
            unavailable.push("Recent activity could not be loaded.");
          }
        }

        // Fetch user's playlists
        let userPlaylists: Playlist[] = [];
        try {
          const { PlaylistService } = await import("@/lib/playlist");
          userPlaylists = await PlaylistService.getUserPlaylists(userData.identityUserId);
          // Filter to only public playlists (playlists that can be viewed by others)
          userPlaylists = userPlaylists.filter(
            playlist => playlist.isPublic === true && playlist.name?.trim()
          );
        } catch (error) {
          console.error("Failed to load user playlists:", error);
          userPlaylists = [];
          unavailable.push("Public playlists could not be loaded.");
        }

        // Fetch weekly top artists (only for own profile as marked private)
        let topArtists: Array<{ name: string; count: number }> = [];
        try {
          if (userData.identityUserId) {
            topArtists = await userApi.getWeeklyTopArtists(userData.identityUserId);
          }
        } catch {
          topArtists = [];
          if (!userData.isPrivate || userData.identityUserId === activeUser?.id)
            unavailable.push("Top artists could not be loaded.");
        }

        if (request !== profileRequest.current.version) return;
        setProfileUser({
          id: userData.id,
          identityUserId: userData.identityUserId,
          username: userData.username,
          displayName: userData.displayName,
          bio: userData.bio,
          avatarUrl: userData.avatarUrl,
          isPrivate: userData.isPrivate,
          friendCount: 0, // Will be set after fetching friends data
          playlists: Array.isArray(userData.playlists) ? userData.playlists : [],
          topArtists,
          recentActivity: recentActivity,
          publicPlaylists: userPlaylists,
        });

        // Load reactions for this user
        if (userData.identityUserId === activeUser?.id) {
          loadReactions(userData.identityUserId);
        }

        // Fetch friends count
        try {
          const friends = await userApi.getFriends(userData.identityUserId);
          const friendsCount = Array.isArray(friends) ? friends.length : 0;
          if (request !== profileRequest.current.version) return;
          setProfileUser(prev => (prev ? { ...prev, friendCount: friendsCount } : prev));
        } catch (error) {
          console.error("Failed to load friends count:", error);
          unavailable.push("Friends could not be loaded.");
        }
        if (request === profileRequest.current.version) setDetailsError(unavailable.join(" "));
      } catch (error) {
        console.error("Failed to load user profile:", error);
        if (request === profileRequest.current.version) {
          setError("Failed to load user profile");
          setProfileUser(null);
        }
      } finally {
        if (request === profileRequest.current.version) setIsLoading(false);
      }
    },
    [loadReactions]
  ); // Remove currentUser from dependencies since we pass the user as parameter

  useDeferredEffect(() => {
    const user = identityApi.getCurrentUser();
    if (!user) {
      setError("Please log in to view profiles");
      setIsLoading(false);
      return;
    }

    setCurrentUser(user);

    if (userId) {
      loadUserProfile(userId, user); // Pass the user directly
    } else {
      router.replace(`/user/${user.id}`);
    }
    const lifecycle = profileRequest.current;
    return () => {
      lifecycle.version++;
    };
  }, [userId, router, loadUserProfile]);

  const handleSendFriendRequest = async () => {
    if (!currentUser || !profileUser || !friendshipStatus || friendshipLoading || friendshipError)
      return;

    // Prevent sending friend request to yourself
    if (isOwnProfile) {
      console.error("Cannot send friend request to yourself");
      return;
    }

    setIsLoadingAction(true);
    setActionError("");
    setShowSuccessMessage(false);
    try {
      await userApi.sendFriendRequest(currentUser.id, profileUser.identityUserId);
      await loadFriendshipStatus();
      setShowSuccessMessage(true);
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error: unknown) {
      console.error("Failed to send friend request:", error);

      // Handle specific error cases
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setActionError(errorMessage);
      await loadFriendshipStatus();
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!currentUser || !friendshipStatus?.friendshipId) {
      return;
    }

    setIsLoadingAction(true);
    setActionError("");
    try {
      await userApi.acceptFriendRequest(friendshipStatus.friendshipId, currentUser.id);
      await loadFriendshipStatus();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Friend request could not be accepted. Please retry."
      );
      await loadFriendshipStatus();
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleDeclineFriendRequest = async () => {
    if (!currentUser || !friendshipStatus?.friendshipId) {
      return;
    }

    setIsLoadingAction(true);
    setActionError("");
    try {
      await userApi.declineFriendRequest(friendshipStatus.friendshipId, currentUser.id);
      await loadFriendshipStatus();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Friend request could not be declined. Please retry."
      );
      await loadFriendshipStatus();
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!currentUser || !friendshipStatus?.friendshipId) return;

    if (!window.confirm("Are you sure you want to remove this friend?")) return;

    setIsLoadingAction(true);
    setActionError("");
    try {
      await userApi.removeFriend(friendshipStatus.friendshipId, currentUser.id);
      await loadFriendshipStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Friend could not be removed. Please retry."
      );
      await loadFriendshipStatus();
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleCancelFriendRequest = async () => {
    if (!currentUser || !friendshipStatus?.friendshipId) return;
    setIsLoadingAction(true);
    setActionError("");
    try {
      await userApi.cancelFriendRequest(friendshipStatus.friendshipId);
      await loadFriendshipStatus();
      eventBus.emit("friendshipStatusChanged", currentUser.id, profileUser!.identityUserId);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Friend request could not be cancelled. Please retry."
      );
      await loadFriendshipStatus();
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleMessage = async () => {
    if (!currentUser || !profileUser) return;

    try {
      const chat = await userApi.createOrGetChat([currentUser.id, profileUser.identityUserId]);
      router.push(`/chat/${chat.chatId}`);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Chat could not be opened. Please retry."
      );
    }
  };

  const handleEditProfile = () => {
    router.push("/user/edit");
  };

  // Functions to handle popup modals
  const handleShowFriends = async () => {
    if (!profileUser) return;

    setIsLoadingPopup(true);
    setPopupError("");
    setShowFriendsPopup(true);

    try {
      // Get friends list from friendships API
      const friendsResponse = await userApi.getFriends(profileUser.identityUserId);
      const friends = Array.isArray(friendsResponse) ? friendsResponse : [];

      const friendDetails: User[] = [];
      for (let offset = 0; offset < friends.length; offset += 50)
        friendDetails.push(
          ...(await userApi.getUserProfilesBatch(friends.slice(offset, offset + 50)))
        );
      setFriendsList(friendDetails);
    } catch (error) {
      console.error("Failed to load friends:", error);
      setFriendsList([]);
      setPopupError(error instanceof Error ? error.message : "Friends could not be loaded.");
    } finally {
      setIsLoadingPopup(false);
    }
  };

  const handleShowPlaylists = async () => {
    if (!profileUser?.publicPlaylists) return;

    setPlaylistsList(profileUser.publicPlaylists);
    setShowPlaylistsPopup(true);
  };

  const renderActionButtons = () => {
    const busy = isLoadingAction || friendshipLoading || !!friendshipError;
    if (isOwnProfile)
      return (
        <Button onClick={handleEditProfile} variant="outline">
          <PencilIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          Edit profile
        </Button>
      );
    if (!friendshipStatus)
      return (
        <Button disabled>
          {friendshipLoading ? "Loading friendship…" : "Friendship unavailable"}
        </Button>
      );
    if (friendshipStatus.status === "accepted")
      return (
        <>
          <Button onClick={handleMessage}>Message</Button>
          <Button onClick={handleRemoveFriend} variant="outline" disabled={busy}>
            Remove Friend
          </Button>
        </>
      );
    if (friendshipStatus.status === "blocked")
      return (
        <Button disabled variant="outline">
          Blocked
        </Button>
      );
    if (friendshipStatus.status === "pending") {
      if (friendshipStatus.requesterId === currentUser?.id)
        return (
          <>
            <span className="text-sm text-gray-400">Request sent</span>
            <Button
              aria-label={`Cancel friend request to ${profileUser?.username || "user"}`}
              onClick={handleCancelFriendRequest}
              disabled={busy}
              variant="outline"
            >
              Cancel request
            </Button>
          </>
        );
      return (
        <>
          <Button onClick={handleAcceptFriendRequest} disabled={busy}>
            <CheckIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Accept Request
          </Button>
          <Button onClick={handleDeclineFriendRequest} disabled={busy} variant="outline">
            Decline
          </Button>
        </>
      );
    }
    return (
      <Button onClick={handleSendFriendRequest} disabled={busy}>
        <UserPlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
        {isLoadingAction ? "Sending…" : "Add Friend"}
      </Button>
    );
  };

  if (isLoading)
    return (
      <p role="status" className="p-6 text-gray-300">
        Loading profile…
      </p>
    );
  if (error || !profileUser)
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">Profile unavailable</h1>
        <p role="alert" className="text-gray-300">
          {error || "This profile could not be loaded."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void loadUserProfile(userId, currentUser)}>Retry profile</Button>
          <Link
            href="/search"
            className="inline-flex min-h-11 items-center px-3 text-purple-300 hover:underline"
          >
            Find people
          </Link>
        </div>
      </main>
    );

  const canViewActivity = isOwnProfile || !profileUser.isPrivate;
  const playlistCards = (playlists: Playlist[]) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {playlists.map(playlist => (
        <Link
          key={playlist.id}
          href={`/playlists/${playlist.id}`}
          onClick={() => setShowPlaylistsPopup(false)}
          className="group min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-300"
        >
          <div className="mb-3 aspect-square overflow-hidden rounded-lg bg-gray-800">
            {playlist.coverUrl ? (
              <MusicImage
                src={playlist.coverUrl}
                alt=""
                size="large"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <MusicalNoteIcon className="h-10 w-10 text-gray-400" aria-hidden="true" />
              </div>
            )}
          </div>
          <h3 className="truncate font-medium text-white group-hover:underline">{playlist.name}</h3>
          <p className="text-sm text-gray-400">
            {playlist.songCount ?? playlist.songs?.length ?? 0} songs
          </p>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <main className="mx-auto max-w-5xl space-y-10 p-4 sm:p-8">
        <header className="space-y-5 border-b border-gray-700 pb-6">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gray-800 sm:h-24 sm:w-24">
              {profileUser.avatarUrl ? (
                <MusicImage
                  src={profileUser.avatarUrl}
                  alt=""
                  type="circle"
                  size="large"
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-3xl font-semibold">
                  {(profileUser.displayName || profileUser.username).charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-semibold sm:text-4xl">
                {profileUser.displayName || profileUser.username}
              </h1>
              <p className="mt-1 break-words text-gray-400">@{profileUser.username}</p>
              {profileUser.isPrivate && (
                <p className="mt-2 text-sm text-gray-400">Private profile</p>
              )}
              {profileUser.bio && (
                <p className="mt-3 max-w-prose whitespace-pre-wrap break-words text-gray-300">
                  {profileUser.bio}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {renderActionButtons()}
            {!isOwnProfile && (
              <Button
                onClick={handleFollow}
                variant="outline"
                disabled={isFollowing === null || isSavingFollow}
                aria-pressed={isFollowing === true}
              >
                {isSavingFollow ? "Saving…" : isFollowing ? "Unfollow" : "Follow"}
              </Button>
            )}
          </div>
          <nav
            aria-label="Profile collections"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <button
              onClick={handleShowFriends}
              className="min-h-11 text-gray-300 hover:text-white hover:underline"
            >
              Friends{" "}
              {detailsError.includes("Friends")
                ? "unavailable"
                : "(" + (profileUser.friendCount ?? 0) + ")"}
            </button>
            <button
              onClick={handleShowPlaylists}
              className="min-h-11 text-gray-300 hover:text-white hover:underline"
            >
              Public playlists{" "}
              {detailsError.includes("playlists")
                ? "unavailable"
                : "(" + (profileUser.publicPlaylists?.length ?? 0) + ")"}
            </button>
            {canViewActivity && (
              <Link
                href={`/user/${profileUser.identityUserId}/listening-history`}
                className="inline-flex min-h-11 items-center text-gray-300 hover:text-white hover:underline"
              >
                Listening history
              </Link>
            )}
          </nav>
          {showSuccessMessage && (
            <p role="status" className="text-sm text-green-300">
              Friend request sent.
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-red-300">
              {actionError}
            </p>
          )}
          {friendshipError && !isOwnProfile && (
            <p role="alert" className="text-sm text-red-300">
              {friendshipError}{" "}
              <button
                onClick={() => void loadFriendshipStatus()}
                disabled={friendshipLoading}
                className="min-h-11 px-2 underline"
              >
                Retry friendship status
              </button>
            </p>
          )}
        </header>
        {detailsError && (
          <p role="alert" className="text-sm text-amber-200">
            {detailsError}{" "}
            <button
              onClick={() => void loadUserProfile(userId, currentUser)}
              className="min-h-11 px-2 underline"
            >
              Retry profile details
            </button>
          </p>
        )}
        {canViewActivity ? (
          <div className="grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="profile-artists">
              <h2 id="profile-artists" className="mb-4 text-lg font-semibold">
                Top artists this week
              </h2>
              {hydratedTopArtists.length ? (
                <ol className="divide-y divide-gray-700">
                  {hydratedTopArtists.slice(0, 5).map(artist => (
                    <li key={artist.id || artist.name} className="flex items-center gap-3 py-3">
                      <MusicImage src={artist.imageUrl} alt="" type="circle" size="small" />
                      <div className="min-w-0 flex-1">
                        {artist.id ? (
                          <Link
                            href={`/artist/${artist.id}`}
                            className="break-words font-medium hover:underline"
                          >
                            {artist.name}
                          </Link>
                        ) : (
                          <span className="break-words font-medium">{artist.name}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-sm text-gray-400">{artist.count} plays</span>
                    </li>
                  ))}
                </ol>
              ) : (
                !detailsError.includes("Top artists") && (
                  <p className="text-sm text-gray-400">
                    No top artists yet. Your listening will appear here.
                  </p>
                )
              )}
            </section>
            <section aria-labelledby="profile-activity">
              <h2 id="profile-activity" className="mb-4 text-lg font-semibold">
                Recent listening
              </h2>
              {profileUser.recentActivity?.length ? (
                <ol className="divide-y divide-gray-700">
                  {profileUser.recentActivity.slice(0, 5).map((activity, index) => (
                    <li
                      key={index}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">{activity.item}</p>
                        <p className="text-sm text-gray-400">{activity.artist}</p>
                      </div>
                      <span className="text-xs text-gray-400">{activity.time}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                !detailsError.includes("Recent activity") && (
                  <p className="text-sm text-gray-400">No recent listening yet.</p>
                )
              )}
            </section>
          </div>
        ) : (
          <p className="text-gray-400">This user&apos;s listening activity is private.</p>
        )}
        {isOwnProfile && (
          <section aria-labelledby="profile-reactions">
            <h2 id="profile-reactions" className="mb-4 text-lg font-semibold">
              Recent reactions
            </h2>
            {isLoadingReactions ? (
              <p role="status" className="text-gray-400">
                Loading reactions…
              </p>
            ) : reactionsError ? (
              <p role="alert" className="text-red-300">
                {reactionsError}{" "}
                <button
                  onClick={() => void loadReactions(profileUser.identityUserId)}
                  className="min-h-11 px-2 underline"
                >
                  Retry reactions
                </button>
              </p>
            ) : reactions.length ? (
              <ul className="divide-y divide-gray-700">
                {reactions.map((reaction, index) => {
                  const search = new URLSearchParams({
                    focusType: reaction.contextType || "recent_song",
                    to: profileUser.identityUserId,
                  });
                  if (reaction.songId) search.set("songId", reaction.songId);
                  const href = reaction.postId
                    ? `/feed/post/${encodeURIComponent(reaction.postId)}`
                    : `/feed?${search.toString()}`;
                  return (
                    <li
                      key={index}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-2xl">{reaction.emoji}</span>
                        <div className="min-w-0">
                          <Link
                            href={`/user/${reaction.fromIdentityUserId}`}
                            className="font-medium hover:underline"
                          >
                            {reaction.fromUserName || "User"}
                          </Link>
                          <p className="text-sm text-gray-400">
                            {reaction.songTitle && `on ${reaction.songTitle}`}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={href}
                        className="inline-flex min-h-11 items-center text-sm text-purple-300 hover:underline"
                      >
                        View activity
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No reactions yet.</p>
            )}
          </section>
        )}
        <section aria-labelledby="profile-playlists">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="profile-playlists" className="text-lg font-semibold">
              Public playlists
            </h2>
            {isOwnProfile && (
              <Link
                href="/playlists"
                className="inline-flex min-h-11 items-center text-sm text-purple-300 hover:underline"
              >
                Manage playlists
              </Link>
            )}
          </div>
          {profileUser.publicPlaylists?.length
            ? playlistCards(profileUser.publicPlaylists)
            : !detailsError.includes("playlists") && (
                <p className="text-sm text-gray-400">No public playlists yet.</p>
              )}
        </section>
      </main>
      {showFriendsPopup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div
            ref={friendsDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-friends-title"
            tabIndex={-1}
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="profile-friends-title" className="text-lg font-semibold">
                Friends
              </h2>
              <button
                aria-label="Close friends"
                onClick={() => setShowFriendsPopup(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-gray-800"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {isLoadingPopup ? (
              <p role="status">Loading friends…</p>
            ) : popupError ? (
              <p role="alert" className="text-red-300">
                {popupError}
                <button onClick={handleShowFriends} className="min-h-11 px-2 underline">
                  Retry friends
                </button>
              </p>
            ) : friendsList.length ? (
              <ul className="divide-y divide-gray-700">
                {friendsList.map(friend => (
                  <li key={friend.id}>
                    <Link
                      href={`/user/${friend.id}`}
                      onClick={() => setShowFriendsPopup(false)}
                      className="flex min-h-16 items-center gap-3 py-3 hover:underline"
                    >
                      <MusicImage src={friend.avatarUrl} alt="" type="circle" size="small" />
                      <span className="min-w-0 break-words">
                        {friend.displayName || friend.username}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">No friends yet.</p>
            )}
          </div>
        </div>
      )}
      {showPlaylistsPopup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div
            ref={playlistsDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-playlists-title"
            tabIndex={-1}
            className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="profile-playlists-title" className="text-lg font-semibold">
                Public playlists
              </h2>
              <button
                aria-label="Close playlists"
                onClick={() => setShowPlaylistsPopup(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-gray-800"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {detailsError.includes("playlists") ? (
              <p role="alert" className="text-amber-200">
                Public playlists could not be loaded. Close this dialog and retry profile details.
              </p>
            ) : playlistsList.length ? (
              playlistCards(playlistsList)
            ) : (
              <p className="text-gray-400">No public playlists yet.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

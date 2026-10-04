"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import MusicImage from "@/components/ui/MusicImage";
import { userApi, identityApi, Chat, User } from "@/lib/api";
import { useNotificationStore } from "@/contexts/NotificationContext";
import { chatHub } from "@/lib/chatHub";

interface ChatWithParticipants extends Chat {
  participantProfiles?: User[];
}

export default function ChatPage() {
  const router = useRouter();
  const notifications = useNotificationStore();
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [chats, setChats] = useState<ChatWithParticipants[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [startingChat, setStartingChat] = useState<string | null>(null);
  // Canonical in-app notifications are owned by NotificationProvider.

  const loadUnreadCounts = useCallback(async () => {
    try {
      const counts = await userApi.getUnreadMessageCounts();
      setUnreadCounts(counts);
      setLoadErrors(previous => ({ ...previous, unread: "" }));
    } catch (error) {
      setLoadErrors(previous => ({
        ...previous,
        unread: error instanceof Error ? error.message : "Unread counts could not be loaded.",
      }));
    }
  }, []);

  useEffect(
    () =>
      notifications.subscribeChatCounts(() => {
        void loadUnreadCounts();
      }),
    [notifications, loadUnreadCounts]
  );

  const loadUserChats = useCallback(async (userId: string) => {
    try {
      const userChats = await userApi.getUserChats(userId);

      // Get all unique participant IDs from all chats
      const allParticipantIds = [...new Set(userChats.flatMap(chat => chat.participants))];

      // Fetch profiles for all participants in one batch call
      const participantProfiles = await userApi.getUserProfilesBatch(allParticipantIds);

      // Create a map for easy lookup
      const profileMap = new Map(participantProfiles.map(profile => [profile.id, profile]));

      // Map chats with their participant profiles
      const chatsWithProfiles = userChats.map(chat => ({
        ...chat,
        participantProfiles: chat.participants.map(
          participantId =>
            profileMap.get(participantId) ||
            ({
              id: participantId,
              username: `User ${participantId.slice(0, 8)}`,
              displayName: `User ${participantId.slice(0, 8)}`,
            } as User)
        ),
      }));

      setChats(chatsWithProfiles);
      setLoadErrors(previous => ({ ...previous, chats: "" }));
    } catch (error) {
      setLoadErrors(previous => ({
        ...previous,
        chats: error instanceof Error ? error.message : "Conversations could not be loaded.",
      }));
    }
  }, []);

  const loadUserFriends = useCallback(async (userId: string) => {
    try {
      const friendIds = await userApi.getFriends(userId);

      // Fetch all friend profiles in one batch call
      const friendProfiles = await userApi.getUserProfilesBatch(friendIds);

      setFriends(friendProfiles);
      setLoadErrors(previous => ({ ...previous, friends: "" }));
    } catch (error) {
      setLoadErrors(previous => ({
        ...previous,
        friends: error instanceof Error ? error.message : "Friends could not be loaded.",
      }));
    }
  }, []); // No dependencies for loadUserFriends

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = identityApi.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          // Get the full user profile with IdentityUserId for proper API calls
          const userProfile = await userApi.getCurrentUserProfile();
          setCurrentUser(userProfile || user);

          // Always use IdentityUserId for API calls
          const userId = userProfile?.id || user.id;
          await Promise.all([loadUserChats(userId), loadUserFriends(userId), loadUnreadCounts()]);
        }
      } catch (error) {
        setLoadErrors(previous => ({
          ...previous,
          profile:
            error instanceof Error
              ? error.message
              : "Your account could not be loaded. Please retry.",
        }));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [loadUnreadCounts, loadUserChats, loadUserFriends, retry]);

  // Message delivery and peer receipts refresh chat-specific unread counts.
  useEffect(() => {
    if (!currentUser?.id) return;
    // Set up chat hub handlers for real-time updates
    chatHub.setHandlers(
      {
        onMessageReceived: () => {
          // Reload chats to update last message and unread counts
          loadUserChats(currentUser.id);
          loadUnreadCounts();
        },
        onMessageRead: () => {
          void loadUnreadCounts();
        },
        onAllMessagesRead: () => {
          void loadUnreadCounts();
        },
        onError: error => {
          console.error("💬 Chat hub error on chat page:", error);
        },
      },
      "ChatList"
    );

    return () => {
      chatHub.removeHandlers("ChatList");
    };
  }, [currentUser?.id, loadUnreadCounts, loadUserChats]);

  const handleStartChat = async (friendId: string) => {
    if (!currentUser || startingChat) return;
    setStartingChat(friendId);
    setLoadErrors(previous => ({ ...previous, create: "" }));

    try {
      const chat = await userApi.createOrGetChat([currentUser.id, friendId]);
      router.push(`/chat/${chat.chatId}`);
    } catch (error) {
      setLoadErrors(previous => ({
        ...previous,
        create:
          error instanceof Error
            ? error.message
            : "Conversation could not be started. Please retry.",
      }));
    } finally {
      setStartingChat(null);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 1) {
      const minutes = Math.max(0, Math.floor(diff / (1000 * 60)));
      return minutes === 0 ? "Just now" : `${minutes}m ago`;
    } else if (hours < 24) {
      return `${Math.floor(hours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getOtherParticipant = (chat: ChatWithParticipants) => {
    const otherParticipantId = chat.participants.find(p => p !== currentUser?.id);
    if (!otherParticipantId || !chat.participantProfiles) return null;

    return chat.participantProfiles.find(p => p.id === otherParticipantId);
  };

  if (isLoading)
    return (
      <p role="status" className="p-6 text-gray-300">
        Loading conversations…
      </p>
    );
  if (!currentUser)
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
        <h1 className="text-3xl font-semibold">Messages</h1>
        <p className="text-gray-300">Sign in to chat with your friends.</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-purple-300 hover:underline"
        >
          Sign in
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Messages</h1>
        <Link
          href="/friends"
          className="inline-flex min-h-11 items-center text-sm text-purple-300 hover:underline"
        >
          Manage friends
        </Link>
      </header>
      {Object.values(loadErrors).some(Boolean) && (
        <p role="alert" className="text-sm text-red-300">
          {Object.values(loadErrors).filter(Boolean).join(" ")}{" "}
          <button
            onClick={() => {
              setLoadErrors({});
              setRetry(value => value + 1);
            }}
            className="min-h-11 px-2 underline"
          >
            Retry conversations
          </button>
        </p>
      )}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]">
        <section aria-labelledby="conversations-title">
          <h2 id="conversations-title" className="mb-4 text-lg font-semibold">
            Recent conversations
          </h2>
          {chats.length ? (
            <ul className="divide-y divide-gray-700">
              {chats.map(chat => {
                const person = getOtherParticipant(chat);
                const unread = unreadCounts[chat.chatId] || 0;
                const name = person?.displayName || person?.username || "User";
                return (
                  <li key={chat.chatId}>
                    <Link
                      href={`/chat/${chat.chatId}`}
                      className="flex min-h-20 items-center gap-3 rounded-lg py-4 pr-2 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-purple-300"
                    >
                      <MusicImage
                        src={person?.avatarUrl}
                        alt=""
                        fallbackText={name.charAt(0)}
                        type="circle"
                        size="medium"
                        className="h-11 w-11 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h3
                            className={`min-w-0 break-words ${unread ? "font-semibold" : "font-medium"}`}
                          >
                            {name}
                          </h3>
                          <time
                            dateTime={chat.lastActivity}
                            className="shrink-0 text-xs text-gray-400"
                          >
                            {formatTime(chat.lastActivity)}
                          </time>
                        </div>
                        <p className="mt-1 truncate text-sm text-gray-400">
                          {chat.lastMessageContent
                            ? (chat.lastMessageSenderId === currentUser.id ? "You: " : "") +
                              chat.lastMessageContent
                            : "No messages yet"}
                        </p>
                        {unread > 0 && (
                          <p className="mt-1 text-xs text-purple-300">
                            {unread} unread {unread === 1 ? "message" : "messages"}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            !loadErrors.chats &&
            !loadErrors.profile && (
              <div className="space-y-2 py-6">
                <p className="text-gray-300">No conversations yet.</p>
                <p className="text-sm text-gray-400">Choose a friend to start a conversation.</p>
              </div>
            )
          )}
        </section>
        <section aria-labelledby="chat-friends-title">
          <h2 id="chat-friends-title" className="mb-4 text-lg font-semibold">
            Start a conversation
          </h2>
          {friends.length ? (
            <ul className="divide-y divide-gray-700">
              {friends.map(friend => (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => void handleStartChat(friend.id)}
                    disabled={startingChat !== null}
                    className="flex min-h-16 w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-gray-800 disabled:opacity-50"
                  >
                    <MusicImage
                      src={friend.avatarUrl}
                      alt=""
                      type="circle"
                      size="small"
                      className="h-10 w-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {friend.displayName || friend.username}
                    </span>
                    {startingChat === friend.id ? (
                      <span role="status" className="text-xs text-gray-400">
                        Opening…
                      </span>
                    ) : (
                      <MessageCircle
                        size={18}
                        className="shrink-0 text-gray-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !loadErrors.friends &&
            !loadErrors.profile && (
              <div className="space-y-2 py-6">
                <p className="text-gray-300">Add a friend to start chatting.</p>
                <Link
                  href="/friends"
                  className="inline-flex min-h-11 items-center text-sm text-purple-300 hover:underline"
                >
                  Find friends
                </Link>
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}

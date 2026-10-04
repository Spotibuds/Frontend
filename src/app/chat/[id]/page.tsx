"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useChatConversation } from "@/hooks/useChatConversation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import MusicImage from "@/components/ui/MusicImage";

export default function ChatPage() {
  const params = useParams();
  const chatId = params.id as string;
  const {
    currentUser,
    otherParticipant,
    chat,
    chatMessages,
    isLoading,
    loadError,
    message,
    setMessage,
    sending,
    sendError,
    readError,
    historyError,
    loadingOlder,
    hasOlder,
    connectionState,
    isConnected,
    handleSendMessage,
    loadOlder,
    reconnect,
    retryLoad,
    retryRead,
    refreshMessages,
  } = useChatConversation(chatId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const nearBottom = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousTail = useRef<string | undefined>(undefined);
  useEffect(() => {
    const changed = () => {
      try {
        const value = localStorage.getItem("sidebarOpen");
        if (value !== null) setSidebarOpen(JSON.parse(value));
      } catch {
        setSidebarOpen(false);
      }
    };
    changed();
    window.addEventListener("storage", changed);
    window.addEventListener("sidebarToggle", changed);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("sidebarToggle", changed);
    };
  }, []);

  useEffect(() => {
    const tail = chatMessages.at(-1)?.messageId;
    if (tail && tail !== previousTail.current) {
      if (nearBottom.current || chatMessages.at(-1)?.senderId === currentUser?.id)
        messagesEndRef.current?.scrollIntoView?.({ behavior: "auto" });
      else setNewMessages(true);
    }
    previousTail.current = tail;
  }, [chatMessages, currentUser?.id]);
  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  if (isLoading) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading chat...</p>
          </div>
        </div>
      </>
    );
  }

  if (loadError)
    return (
      <div className="p-6">
        <p role="alert" className="text-red-300">
          {loadError}
        </p>
        <Button onClick={retryLoad}>Retry conversation</Button>
      </div>
    );

  if (!currentUser) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
            <p className="text-gray-400">Please log in to access this chat.</p>
          </div>
        </div>
      </>
    );
  }

  if (!chat) {
    return (
      <>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
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
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Chat Not Found</h2>
            <p className="text-gray-400">
              This chat doesn&apos;t exist or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        style={{ bottom: "var(--music-player-height, 112px)" }}
        className={`fixed top-16 transition-all duration-300 z-35 ${sidebarOpen ? "left-0 lg:left-72" : "left-0"} right-0`}
      >
        <div className="flex flex-col h-full max-w-full">
          <div className="bg-gray-900 px-4 py-2">
            <Link href="/chat" className="text-sm text-gray-400 hover:text-white">
              ← Messages
            </Link>
          </div>
          {/* Chat Header */}
          <div className="p-3 sm:p-4 border-b border-gray-700 bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MusicImage
                  src={otherParticipant?.avatarUrl}
                  alt={
                    otherParticipant
                      ? otherParticipant.displayName || otherParticipant.username
                      : "Unknown User"
                  }
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full"
                />
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-semibold text-white truncate">
                    {otherParticipant
                      ? otherParticipant.displayName || otherParticipant.username
                      : "Unknown User"}
                  </h1>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <span
                      className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
                    ></span>
                    <span className="text-gray-400">
                      {isConnected
                        ? "Connected"
                        : connectionState === "Connected"
                          ? "Joining conversation"
                          : connectionState}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {newMessages && (
            <button
              type="button"
              className="bg-gray-700 p-2 text-sm"
              onClick={() => {
                nearBottom.current = true;
                setNewMessages(false);
                messagesEndRef.current?.scrollIntoView?.({ behavior: "auto" });
              }}
            >
              New messages ↓
            </button>
          )}
          {/* Messages Area */}
          <div
            onScroll={event => {
              const node = event.currentTarget;
              nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
              if (nearBottom.current) setNewMessages(false);
            }}
            role="log"
            aria-label="Conversation messages"
            className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 lg:p-4 space-y-2 sm:space-y-3 lg:space-y-4"
          >
            {hasOlder && (
              <Button onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? "Loading older messages..." : "Load older messages"}
              </Button>
            )}
            {historyError && (
              <p role="alert" className="text-red-300">
                {historyError} <button onClick={refreshMessages}>Retry loading messages</button>
              </p>
            )}
            {chatMessages.length === 0 ? (
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
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No messages yet</h3>
                <p className="text-gray-400">Start the conversation by sending a message!</p>
              </div>
            ) : (
              chatMessages.map(msg => {
                // Skip messages without valid messageId to prevent React key warnings and API errors
                if (!msg.messageId) {
                  console.warn("Message missing messageId:", msg);
                  return null;
                }

                // Use IdentityUserId for comparison since that's what we're using consistently
                const isOwnMessage = msg.senderId === currentUser?.id;

                return (
                  <div
                    key={msg.messageId}
                    className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[280px] sm:max-w-xs lg:max-w-sm xl:max-w-md px-3 sm:px-4 py-2 sm:py-3 rounded-xl shadow-sm ${
                        isOwnMessage ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs sm:text-sm font-medium opacity-90">
                          {isOwnMessage ? "You" : msg.senderName}
                        </span>
                        <time
                          dateTime={msg.timestamp}
                          title={new Date(msg.timestamp).toLocaleString()}
                          className="text-xs opacity-60"
                        >
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {msg.content}
                      </p>
                      {isOwnMessage && (
                        <div className="flex justify-end mt-2">
                          <span
                            aria-label={msg.isRead ? "Read" : "Sent"}
                            title={msg.isRead ? "Read" : "Sent"}
                            className="text-xs opacity-60"
                          >
                            {msg.isRead ? "✓✓" : "✓"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-3 sm:p-4 border-t border-gray-700 bg-gray-900/50">
            <div className="flex gap-2 sm:gap-3 items-end">
              <div className="flex-1">
                <Input
                  aria-label="Type a message..."
                  ref={inputRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type a message..."
                  className="w-full bg-gray-800 border-gray-600 text-white placeholder-gray-400 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                />
              </div>
              <Button
                aria-label="Send message"
                onClick={() => {
                  void handleSendMessage().then(() => inputRef.current?.focus());
                }}
                disabled={!message.trim() || !isConnected || sending}
                className="bg-primary hover:bg-purple-300 text-primary-foreground rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 h-auto disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
                size="sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </Button>
            </div>
            {sendError && (
              <p role="alert" className="text-red-300 mt-2">
                {sendError}
              </p>
            )}
            {readError && (
              <p role="alert" className="text-amber-300 mt-2">
                {readError} <button onClick={retryRead}>Retry read status</button>
              </p>
            )}
            {!isConnected && (
              <p className="text-xs text-amber-300 mt-2">
                Live chat is disconnected. Your draft is kept.{" "}
                <button onClick={() => void reconnect()}>Reconnect conversation</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

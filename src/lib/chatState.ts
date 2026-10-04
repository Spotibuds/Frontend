export interface ChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  isDelivered?: boolean;
  readBy?: string[];
}

export function mapChatMessage(value: Record<string, unknown>): ChatMessage {
  const senderId = String(value.senderId || "");
  const readBy = Array.isArray(value.readBy) ? value.readBy : [];
  return {
    messageId: String(value.messageId || value.id || ""),
    chatId: String(value.chatId || ""),
    senderId,
    senderName: String(value.senderUsername || value.senderName || "Unknown User"),
    senderAvatar: typeof value.senderAvatar === "string" ? value.senderAvatar : undefined,
    content: String(value.content || ""),
    timestamp: String(value.sentAt || value.createdAt || value.timestamp || ""),
    isRead: Boolean(value.isRead) || readBy.some(read => read?.userId && read.userId !== senderId),
    isDelivered: typeof value.isDelivered === "boolean" ? value.isDelivered : undefined,
    readBy: readBy.map(read => String(read?.userId || "")).filter(Boolean),
  };
}

// REST history, realtime echoes and invoke acknowledgements can arrive in any order.
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const saved = new Map(current.map(message => [message.messageId, message]));
  for (const message of incoming) {
    if (!message.messageId) continue;
    const previous = saved.get(message.messageId);
    saved.set(message.messageId, {
      ...previous,
      ...message,
      isRead: Boolean(previous?.isRead || message.isRead),
      isDelivered: previous?.isDelivered || message.isDelivered,
      readBy: [...new Set([...(previous?.readBy || []), ...(message.readBy || [])])],
    });
  }
  return [...saved.values()].sort((a, b) => {
    const difference = (Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0);
    return difference || a.messageId.localeCompare(b.messageId);
  });
}

export interface DraftAttempt {
  chatId: string;
  content: string;
  id: string;
}

export function compareChatPositions(
  left: Pick<ChatMessage, "messageId" | "timestamp">,
  right: Pick<ChatMessage, "messageId" | "timestamp">
) {
  return (
    (Date.parse(left.timestamp) || 0) - (Date.parse(right.timestamp) || 0) ||
    left.messageId.localeCompare(right.messageId)
  );
}
export function getDraftAttempt(
  previous: DraftAttempt | null,
  chatId: string,
  content: string
): DraftAttempt {
  const trimmed = content.trim();
  return previous?.chatId === chatId && previous.content === trimmed
    ? previous
    : { chatId, content: trimmed, id: crypto.randomUUID() };
}

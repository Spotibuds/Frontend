import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

// Types for friend and chat functionality
export interface FriendRequest {
  requestId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: Date;
}

export interface Friend {
  id: string;
  username: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen?: Date;
}

export interface ChatMessage {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  createdAt: Date;
  lastMessageAt?: Date;
  lastMessage?: string;
  unreadCount: number;
}

class FriendHubManager {
  private connection: HubConnection | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private currentUserId: string | null = null;

  // Event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestReceived: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestAccepted: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRequestDeclined: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendRemoved: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onFriendStatusChanged: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onMessageReceived: ((message: ChatMessage) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onMessageSent: ((data: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onMessageRead: ((data: any) => void) | null = null;
  private onChatCreated: ((chat: Chat) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private onConnectionStateChanged: ((state: string) => void) | null = null;

  async connect(userId: string): Promise<void> {
    if (this.connection?.state === 'Connected' && this.currentUserId === userId) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    if (this.connection && this.connection.state !== 'Disconnected') {
      try {
        await this.connection.stop();
      } catch (error) {
        console.error('Error stopping existing connection:', error);
      }
    }

    this.isConnecting = true;
    this.currentUserId = userId;

    try {
      const userApiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:5002';
      const hubUrl = `${userApiUrl}/friend-hub?userId=${userId}`;
      
      this.connection = new HubConnectionBuilder()
        .withUrl(hubUrl, {
          withCredentials: true,
          skipNegotiation: false
        })
        .configureLogging(LogLevel.Warning)
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build();

      this.setupEventHandlers();

      await this.connection.start();
      this.reconnectAttempts = 0;
      this.onConnectionStateChanged?.('Connected');
    } catch (error) {
      console.error('Failed to connect to Friend Hub:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts < this.maxReconnectAttempts && this.isConnecting) {
        setTimeout(() => this.connect(userId), this.reconnectDelay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.onError?.('Failed to connect to friend service after multiple attempts');
      }
    } finally {
      this.isConnecting = false;
    }
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Friend request events
    this.connection.on('FriendRequestReceived', (request: FriendRequest) => {
      if (this.onFriendRequestReceived) {
        this.onFriendRequestReceived(request);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('FriendRequestAccepted', (data: any) => {
      if (this.onFriendRequestAccepted) {
        this.onFriendRequestAccepted(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('FriendRequestDeclined', (data: any) => {
      if (this.onFriendRequestDeclined) {
        this.onFriendRequestDeclined(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('FriendRemoved', (data: any) => {
      if (this.onFriendRemoved) {
        this.onFriendRemoved(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('FriendStatusChanged', (data: any) => {
      if (this.onFriendStatusChanged) {
        this.onFriendStatusChanged(data);
      }
    });

    // Chat events
    this.connection.on('MessageReceived', (message: ChatMessage) => {
      if (this.onMessageReceived) {
        this.onMessageReceived(message);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('MessageSent', (data: any) => {
      if (this.onMessageSent) {
        this.onMessageSent(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('MessageRead', (data: any) => {
      if (this.onMessageRead) {
        this.onMessageRead(data);
      }
    });

    this.connection.on('ChatCreated', (chat: Chat) => {
      if (this.onChatCreated) {
        this.onChatCreated(chat);
      }
    });

    // Connection events
    this.connection.onclose((error) => {
      this.onConnectionStateChanged?.('Disconnected');
      if (error) {
        console.error('Friend Hub connection closed with error:', error);
        this.onError?.('Connection lost. Attempting to reconnect...');
      }
    });

    this.connection.onreconnecting((error) => {
      this.onConnectionStateChanged?.('Reconnecting');
      console.log('Reconnecting to Friend Hub...', error);
    });

    this.connection.onreconnected((connectionId) => {
      this.onConnectionStateChanged?.('Connected');
      console.log('Reconnected to Friend Hub with connection ID:', connectionId);
    });

    // Error handling
    this.connection.on('Error', (error: string) => {
      console.error('Friend Hub error:', error);
      this.onError?.(error);
    });
  }

  // Friend Management Methods
  async sendFriendRequest(targetUserId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('SendFriendRequest', targetUserId);
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('AcceptFriendRequest', requestId);
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('DeclineFriendRequest', requestId);
    } catch (error) {
      console.error('Error declining friend request:', error);
      throw error;
    }
  }

  async removeFriend(friendId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('RemoveFriend', friendId);
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  }

  // Chat Methods
  async sendMessage(chatId: string, message: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('SendMessage', chatId, message);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('MarkMessageAsRead', messageId);
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw error;
    }
  }

  async createChat(friendId: string): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('CreateChat', friendId);
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  async getOnlineFriends(): Promise<void> {
    if (!this.connection || this.connection.state !== 'Connected') {
      throw new Error('Not connected to Friend Hub');
    }

    try {
      await this.connection.invoke('GetOnlineFriends');
    } catch (error) {
      console.error('Error getting online friends:', error);
      throw error;
    }
  }

  // Connection Management
  async disconnect(): Promise<void> {
    if (this.connection && this.connection.state !== 'Disconnected') {
      try {
        await this.connection.stop();
        this.currentUserId = null;
        this.onConnectionStateChanged?.('Disconnected');
      } catch (error) {
        console.error('Error during disconnect:', error);
      } finally {
        this.connection = null;
      }
    }
  }

  // Event Handler Setters
  setOnFriendRequestReceived(handler: ((request: FriendRequest) => void) | null): void {
    this.onFriendRequestReceived = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRequestAccepted(handler: ((data: any) => void) | null): void {
    this.onFriendRequestAccepted = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRequestDeclined(handler: ((data: any) => void) | null): void {
    this.onFriendRequestDeclined = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendRemoved(handler: ((data: any) => void) | null): void {
    this.onFriendRemoved = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnFriendStatusChanged(handler: ((data: any) => void) | null): void {
    this.onFriendStatusChanged = handler;
  }

  setOnMessageReceived(handler: ((message: ChatMessage) => void) | null): void {
    this.onMessageReceived = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnMessageSent(handler: ((data: any) => void) | null): void {
    this.onMessageSent = handler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOnMessageRead(handler: ((data: any) => void) | null): void {
    this.onMessageRead = handler;
  }

  setOnChatCreated(handler: ((chat: Chat) => void) | null): void {
    this.onChatCreated = handler;
  }

  setOnError(handler: ((error: string) => void) | null): void {
    this.onError = handler;
  }

  setOnConnectionStateChanged(handler: ((state: string) => void) | null): void {
    this.onConnectionStateChanged = handler;
  }

  // Utility Methods
  getConnectionState(): string {
    return this.connection?.state || 'Disconnected';
  }

  isConnected(): boolean {
    return this.connection?.state === 'Connected';
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

// Create singleton instance
export const friendHubManager = new FriendHubManager(); 
import { HubConnection, HubConnectionBuilder, LogLevel, HubConnectionState, HttpTransportType } from '@microsoft/signalr';

// Import the refresh token function from api.ts
const API_CONFIG = {
  IDENTITY_API: process.env.NEXT_PUBLIC_IDENTITY_API || 'http://localhost:5000',
  USER_API: process.env.NEXT_PUBLIC_USER_API || 'http://localhost:5002'
};

// Token refresh function for SignalR
const refreshTokenForSignalR = async (): Promise<string | null> => {
  const refreshTokenValue = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  
  if (!refreshTokenValue) {
    return null;
  }

  try {
    const response = await fetch(`${API_CONFIG.IDENTITY_API}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (!response.ok) {
      // Refresh token is invalid or expired
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('currentUser');
      }
      return null;
    }

    const data = await response.json();
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    
    return data.token;
  } catch (error) {
    console.error('Token refresh failed for SignalR:', error);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('currentUser');
    }
    return null;
  }
};

// Types for friend and chat functionality
export interface FriendRequest {
  requestId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
}

export interface Friend {
  id: string;
  username: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface ChatMessage {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  createdAt: string;
  lastMessageAt?: string;
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
  private onOnlineFriendsReceived: ((onlineFriends: string[]) => void) | null = null;

  async connect(userId: string): Promise<void> {
    if (this.isConnecting || this.connection?.state === HubConnectionState.Connected) {
      return;
    }

    this.isConnecting = true;
    this.currentUserId = userId;

    try {
      const userApiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:5002';
      const token = localStorage.getItem('token');
      
      // Reduced logging - only log critical info
      // console.log('Connecting to SignalR Hub...');
      
      // Use the correct hub URL with access_token parameter for authentication
      const hubUrl = `${userApiUrl}/friend-hub?access_token=${encodeURIComponent(token || '')}`;
      
      this.connection = new HubConnectionBuilder()
        .withUrl(hubUrl, {
          withCredentials: true,
          skipNegotiation: false,
          transport: HttpTransportType.LongPolling, // Use only LongPolling to avoid WebSocket/SSE auth issues
          accessTokenFactory: async () => {
            // Get JWT token from localStorage
            let token = localStorage.getItem('token');
            if (token) {
              return token;
            }
            
            // If no token, try to refresh
            token = await refreshTokenForSignalR();
            return token || '';
          }
        })
        .configureLogging(LogLevel.None) // Completely disable SignalR logging to reduce console noise
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .build();

      this.setupEventHandlers();

      // console.log('Starting SignalR connection...');
      await this.connection.start();
      console.log('✅ SignalR connected successfully');
      this.reconnectAttempts = 0;
      this.onConnectionStateChanged?.('Connected');
    } catch (error) {
      // Only log connection failures that aren't transport fallbacks
      if (error instanceof Error && !error.message.includes('transport')) {
        console.error('Failed to connect to Friend Hub:', error.message);
      }
      
      // Check if it's an authentication error
      if (error instanceof Error && (error.message.includes('Unauthorized') || error.message.includes('401'))) {
        console.log('Authentication failed, attempting token refresh...');
        try {
          const newToken = await refreshTokenForSignalR();
          if (newToken) {
            console.log('Token refreshed successfully, retrying connection...');
            // Retry connection with new token
            this.reconnectAttempts = 0;
            setTimeout(() => this.connect(userId), 1000);
            return;
          } else {
            console.error('Token refresh failed, authentication required');
            this.onError?.('Authentication failed. Please log in again.');
            return;
          }
        } catch (refreshError) {
          console.error('Token refresh error:', refreshError);
          this.onError?.('Authentication failed. Please log in again.');
          return;
        }
      }
      
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts < this.maxReconnectAttempts && this.isConnecting) {
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
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

    // Online friends event
    this.connection.on('OnlineFriends', (onlineFriends: string[]) => {
      if (this.onOnlineFriendsReceived) {
        this.onOnlineFriendsReceived(onlineFriends);
      }
    });

    // Chat events
    this.connection.on('MessageReceived', (message: ChatMessage) => {
      console.log('MessageReceived event:', message);
      if (this.onMessageReceived) {
        this.onMessageReceived(message);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('MessageSent', (data: any) => {
      console.log('MessageSent event:', data);
      if (this.onMessageSent) {
        this.onMessageSent(data);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.connection.on('MessageRead', (data: any) => {
      console.log('MessageRead event:', data);
      if (this.onMessageRead) {
        this.onMessageRead(data);
      }
    });

    this.connection.on('ChatCreated', (chat: Chat) => {
      console.log('ChatCreated event:', chat);
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
      this.connection.send('GetOnlineFriends'); // Changed from invoke to send
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

  setOnOnlineFriendsReceived(handler: ((onlineFriends: string[]) => void) | null): void {
    this.onOnlineFriendsReceived = handler;
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
import { HubConnection, HubConnectionBuilder, LogLevel, HubConnectionState, HttpTransportType } from '@microsoft/signalr';
import { API_CONFIG } from './api';
import { notificationService } from './notificationService';

// Token refresh function for ChatHub
const refreshTokenForChatHub = async (): Promise<string | null> => {
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
    console.error('Token refresh failed for ChatHub:', error);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('currentUser');
    }
    return null;
  }
};

// Chat message interface
export interface ChatMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

// Chat hub handlers interface
export interface ChatHubHandlers {
  onMessageReceived?: (message: ChatMessage) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onMessageRead?: (messageId: string) => void;
  onUserStartedTyping?: (userId: string) => void;
  onUserStoppedTyping?: (userId: string) => void;
  onChatJoined?: (chatId: string) => void;
  onChatLeft?: (chatId: string) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: HubConnectionState) => void;
}

class ChatHubService {
  private connection: HubConnection | null = null;
  private handlers: ChatHubHandlers = {};
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private connectionAttempts = 0;
  private maxReconnectAttempts = 5;
  private connectionEnabled = false;
  private currentChatId: string | null = null;

  constructor() {
    console.log('💬 ChatHub service initialized (connection disabled until authenticated)');
  }

  // Method to enable chat when user is authenticated
  enableConnection() {
    this.connectionEnabled = true;
    this.initializeConnection();
  }

  // Method to disable chat when user logs out
  disableConnection() {
    this.connectionEnabled = false;
    this.disconnect();
  }

  private initializeConnection() {
    if (!this.connectionEnabled || this.isDestroyed) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      console.log('💬 No token found, chat disabled until login');
      return;
    }

    try {
      this.connection = new HubConnectionBuilder()
        .withUrl(`${API_CONFIG.USER_API}/chat-hub`, {
          accessTokenFactory: async () => {
            if (!this.connectionEnabled) {
              return '';
            }

            let currentToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            
            if (!currentToken) {
              if (this.connectionEnabled) {
                console.log('💬 No token, attempting refresh...');
                currentToken = await refreshTokenForChatHub();
              }
            }
            
            return currentToken || '';
          },
          withCredentials: false,
          transport: HttpTransportType.LongPolling,
          skipNegotiation: false
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            if (!this.connectionEnabled) {
              return null;
            }
            const delay = Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
            console.log(`💬 ChatHub reconnecting in ${delay}ms (attempt ${retryContext.previousRetryCount + 1})`);
            return delay;
          }
        })
        .configureLogging(LogLevel.Information)
        .build();

      this.setupEventHandlers();
      this.startConnection();
    } catch (error) {
      console.error('💬 Failed to initialize ChatHub connection:', error);
    }
  }

  private setupEventHandlers() {
    if (!this.connection) return;

    // Handle incoming messages
    this.connection.on('ReceiveMessage', (message: any) => {
  console.log('💬 Message received:', message);
      
      // Map the backend message structure to our ChatMessage interface
      const mappedMessage: ChatMessage = {
        messageId: message.id || message.messageId, // Backend sends 'id', we need 'messageId'
        chatId: message.chatId,
        senderId: message.senderId,
        senderName: message.senderUsername || message.senderName || 'Unknown User',
        content: message.content,
        timestamp: message.createdAt || message.timestamp,
        isRead: message.isRead || false
      };
      
      this.handlers.onMessageReceived?.(mappedMessage);

      // Also forward the message to the global notification service so AppLayout
      // can display a styled, app-wide toast (friend-request style) when appropriate.
      try {
        console.debug('chatHub: forwarding message to notificationService', { chatId: mappedMessage.chatId, messageId: mappedMessage.messageId });
        notificationService.handleMessage({
          chatId: mappedMessage.chatId,
          content: mappedMessage.content,
          senderId: mappedMessage.senderId,
          senderName: mappedMessage.senderName,
          messageId: mappedMessage.messageId,
          timestamp: mappedMessage.timestamp,
          isRead: mappedMessage.isRead
        } as any);
      } catch (err) {
        console.warn('Failed to forward message to notificationService:', err);
      }
    });

    // Handle message sent confirmation
    this.connection.on('MessageSent', (message: any) => {
      console.log('💬 Message sent confirmed:', message);
      
      // Map the backend message structure to our ChatMessage interface
      const mappedMessage: ChatMessage = {
        messageId: message.id || message.messageId, // Backend sends 'id', we need 'messageId'
        chatId: message.chatId,
        senderId: message.senderId,
        senderName: message.senderUsername || message.senderName || 'Unknown User',
        content: message.content,
        timestamp: message.createdAt || message.timestamp,
        isRead: message.isRead || false
      };
      
      this.handlers.onMessageSent?.(mappedMessage);
    });

    // Handle message read status
    this.connection.on('MessageRead', (messageId: string) => {
      this.handlers.onMessageRead?.(messageId);
    });

    // Handle typing indicators
    this.connection.on('UserStartedTyping', (userId: string) => {
      this.handlers.onUserStartedTyping?.(userId);
    });

    this.connection.on('UserStoppedTyping', (userId: string) => {
      this.handlers.onUserStoppedTyping?.(userId);
    });

    // Handle chat join/leave
    this.connection.on('JoinedChat', (chatId: string) => {
      console.log('💬 Joined chat:', chatId);
      this.currentChatId = chatId;
      this.handlers.onChatJoined?.(chatId);
    });

    this.connection.on('LeftChat', (chatId: string) => {
      console.log('💬 Left chat:', chatId);
      this.currentChatId = null;
      this.handlers.onChatLeft?.(chatId);
    });

    this.connection.on('Error', (error: string) => {
      console.error('💬 ChatHub error:', error);
      this.handlers.onError?.(error);
    });

    // Connection state handlers
    this.connection.onreconnecting(() => {
      console.log('💬 ChatHub reconnecting...');
      this.handlers.onConnectionStateChange?.(HubConnectionState.Reconnecting);
    });

    this.connection.onreconnected(() => {
      console.log('💬 ChatHub reconnected');
      this.connectionAttempts = 0;
      this.handlers.onConnectionStateChange?.(HubConnectionState.Connected);
      
      // Rejoin current chat if we were in one
      if (this.currentChatId) {
        this.joinChat(this.currentChatId);
      }
    });

    this.connection.onclose(async () => {
      console.log('💬 ChatHub connection closed');
      this.handlers.onConnectionStateChange?.(HubConnectionState.Disconnected);
      
      if (!this.isDestroyed && this.connectionEnabled && this.connectionAttempts < this.maxReconnectAttempts) {
        this.connectionAttempts++;
        console.log(`💬 Attempting to reconnect ChatHub (${this.connectionAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
          this.startConnection();
        }, 5000);
      }
    });
  }

  private async startConnection() {
    if (!this.connection || this.isDestroyed || !this.connectionEnabled) {
      return;
    }

    try {
      await this.connection.start();
      console.log('💬 ChatHub connected successfully');
      this.connectionAttempts = 0;
      this.handlers.onConnectionStateChange?.(HubConnectionState.Connected);
    } catch (error) {
      console.error('💬 ChatHub connection failed:', error);
      this.handlers.onConnectionStateChange?.(HubConnectionState.Disconnected);
      
      if (!this.isDestroyed && this.connectionEnabled && this.connectionAttempts < this.maxReconnectAttempts) {
        this.connectionAttempts++;
        this.reconnectTimer = setTimeout(() => {
          this.startConnection();
        }, 5000);
      }
    }
  }

  // Public methods
  setHandlers(handlers: ChatHubHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  removeHandlers() {
    this.handlers = {};
  }

  async joinChat(chatId: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('💬 ChatHub not connected, cannot join chat');
      return;
    }

    try {
      await this.connection.invoke('JoinChat', chatId);
      this.currentChatId = chatId;
    } catch (error) {
      console.error('💬 Failed to join chat:', error);
    }
  }

  async leaveChat(chatId: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('💬 ChatHub not connected, cannot leave chat');
      return;
    }

    try {
      await this.connection.invoke('LeaveChat', chatId);
      this.currentChatId = null;
    } catch (error) {
      console.error('💬 Failed to leave chat:', error);
    }
  }

  async sendMessage(chatId: string, content: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('💬 ChatHub not connected, cannot send message');
      return;
    }

    try {
      await this.connection.invoke('SendMessage', chatId, content);
    } catch (error) {
      console.error('💬 Failed to send message:', error);
    }
  }

  async startTyping(chatId: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      return;
    }

    try {
      await this.connection.invoke('StartTyping', chatId);
    } catch (error) {
      console.error('💬 Failed to send typing indicator:', error);
    }
  }

  async stopTyping(chatId: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      return;
    }

    try {
      await this.connection.invoke('StopTyping', chatId);
    } catch (error) {
      console.error('💬 Failed to stop typing indicator:', error);
    }
  }

  getConnectionState(): HubConnectionState {
    return this.connection?.state ?? HubConnectionState.Disconnected;
  }

  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  async disconnect() {
    if (this.connection?.state === HubConnectionState.Connected || 
        this.connection?.state === HubConnectionState.Connecting) {
      try {
        console.log('💬 Disconnecting ChatHub...');
        if (this.currentChatId) {
          await this.leaveChat(this.currentChatId);
        }
        await this.connection.stop();
      } catch (error) {
        console.error('💬 Error disconnecting ChatHub:', error);
      }
    }
    this.connection = null;
    this.currentChatId = null;
  }

  destroy() {
    this.isDestroyed = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection) {
      console.log('💬 Destroying ChatHub connection');
      this.connection.stop().catch(console.error);
      this.connection = null;
    }

    this.handlers = {};
    this.currentChatId = null;
  }
}

// Export singleton instance
export const chatHub = new ChatHubService();

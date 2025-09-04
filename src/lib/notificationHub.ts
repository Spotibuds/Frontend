import { HubConnection, HubConnectionBuilder, LogLevel, HubConnectionState, HttpTransportType } from '@microsoft/signalr';
import { API_CONFIG } from './api';

// Production-ready SignalR configuration
const getSignalRApiConfig = () => {
  const nodeEnv = process.env.NODE_ENV;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  const isProduction = nodeEnv === 'production' || 
    (typeof window !== 'undefined' && !hostname.includes('localhost') && !hostname.includes('127.0.0.1'));

  if (typeof window !== 'undefined' && !(window as any).__NOTIFICATION_HUB_DEBUG_LOGGED) {
    console.log('🔔 NotificationHub Configuration:', {
      nodeEnv,
      hostname,
      isProduction,
      hubUrl: `${API_CONFIG.USER_API}/notification-hub`
    });
    (window as any).__NOTIFICATION_HUB_DEBUG_LOGGED = true;
  }

  return API_CONFIG;
};

const SIGNALR_CONFIG = getSignalRApiConfig();

// Token refresh function for SignalR
const refreshTokenForNotifications = async (): Promise<string | null> => {
  const refreshTokenValue = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  
  if (!refreshTokenValue) {
    return null;
  }

  try {
    const response = await fetch(`${SIGNALR_CONFIG.IDENTITY_API}/api/auth/refresh`, {
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
    console.error('Token refresh failed for NotificationHub:', error);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('currentUser');
    }
    return null;
  }
};

// Notification types
export interface RealtimeNotification {
  type?: string;
  Type?: string;
  title?: string;
  Title?: string;
  message?: string;
  Message?: string;
  sourceUserId?: string;
  SourceUserId?: string;
  sourceUserName?: string;
  SourceUserName?: string;
  sourceUserAvatar?: string;
  SourceUserAvatar?: string;
  data?: Record<string, any>;
  Data?: Record<string, any>;
  timestamp?: string;
  Timestamp?: string;
  actionUrl?: string;
  ActionUrl?: string;
}

export interface NotificationHandlers {
  onNewNotification?: (notification: RealtimeNotification) => void;
  onUnreadCountUpdate?: (count: number) => void;
  onChatUnreadCountUpdate?: (data: { chatId: string, unreadCount: number }) => void;
  onNotificationMarkedRead?: (notificationId: string) => void;
  onNotificationHandled?: (notificationId: string) => void;
  onAllNotificationsMarkedRead?: () => void;
  onNotificationsLoaded?: (data: { notifications: any[], unreadCount: number }) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: HubConnectionState) => void;
}

// Internal handler arrays for multiple subscribers
interface MultipleHandlers {
  onNewNotification: Array<(notification: RealtimeNotification) => void>;
  onUnreadCountUpdate: Array<(count: number) => void>;
  onChatUnreadCountUpdate: Array<(data: { chatId: string, unreadCount: number }) => void>;
  onNotificationMarkedRead: Array<(notificationId: string) => void>;
  onNotificationHandled: Array<(notificationId: string) => void>;
  onAllNotificationsMarkedRead: Array<() => void>;
  onNotificationsLoaded: Array<(data: { notifications: any[], unreadCount: number }) => void>;
  onError: Array<(error: string) => void>;
  onConnectionStateChange: Array<(state: HubConnectionState) => void>;
}

class NotificationHubService {
  private connection: HubConnection | null = null;
  private handlers: MultipleHandlers = {
    onNewNotification: [],
    onUnreadCountUpdate: [],
    onChatUnreadCountUpdate: [],
    onNotificationMarkedRead: [],
    onNotificationHandled: [],
    onAllNotificationsMarkedRead: [],
    onNotificationsLoaded: [],
    onError: [],
    onConnectionStateChange: []
  };
  private handlerSets = new Map<string, Set<(...args: any[]) => void>>(); // Track unique handlers per component
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private connectionAttempts = 0;
  private maxReconnectAttempts = 5;
  private connectionEnabled = false; // Add flag to control connection attempts

  constructor() {
    // Don't initialize connection in constructor - wait for explicit enablement
    console.log('🔔 NotificationHub service initialized (connection disabled until authenticated)');
  }

  // Method to enable notifications when user is authenticated
  enableConnection() {
    this.connectionEnabled = true;
    this.initializeConnection();
  }

  // Method to disable notifications when user logs out
  disableConnection() {
    this.connectionEnabled = false;
    this.disconnect();
  }

  private initializeConnection() {
    // Don't attempt connection if disabled or already destroyed
    if (!this.connectionEnabled || this.isDestroyed) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      console.log('🔔 No token found, notifications disabled until login');
      return;
    }

    try {
      this.connection = new HubConnectionBuilder()
        .withUrl(`${SIGNALR_CONFIG.USER_API}/notification-hub`, {
          accessTokenFactory: async () => {
            // Skip token refresh attempts if connection is disabled
            if (!this.connectionEnabled) {
              return '';
            }

            let currentToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            
            if (!currentToken) {
              // Only attempt refresh if connection is still enabled
              if (this.connectionEnabled) {
                console.log('🔔 No token, attempting refresh...');
                currentToken = await refreshTokenForNotifications();
              }
            }
            
            return currentToken || '';
          },
          withCredentials: false,
          // Prioritize LongPolling for better Azure compatibility, fallback to other transports
          transport: HttpTransportType.LongPolling,
          skipNegotiation: false
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            // Don't reconnect if connection is disabled
            if (!this.connectionEnabled) {
              return null; // Stop reconnection
            }
            const delay = Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
            console.log(`🔔 NotificationHub reconnecting in ${delay}ms (attempt ${retryContext.previousRetryCount + 1})`);
            return delay;
          }
        })
        .configureLogging(LogLevel.Information)
        .build();

      this.setupEventHandlers();
      this.startConnection();
    } catch (error) {
      console.error('🔔 Failed to initialize NotificationHub connection:', error);
    }
  }

  private setupEventHandlers() {
    if (!this.connection) return;

    // Handle incoming notifications
    this.connection.on('NewNotification', (notification: RealtimeNotification) => {
      console.log('🔔 NOTIFICATION HUB: New notification received from server:', notification);

      // Normalize notification properties to handle both PascalCase and camelCase
      const normalizedNotification: RealtimeNotification = {
        type: notification.type || notification.Type,
        title: notification.title || notification.Title,
        message: notification.message || notification.Message,
        sourceUserId: notification.sourceUserId || notification.SourceUserId,
        sourceUserName: notification.sourceUserName || notification.SourceUserName,
        sourceUserAvatar: notification.sourceUserAvatar || notification.SourceUserAvatar,
        data: notification.data || notification.Data,
        timestamp: notification.timestamp || notification.Timestamp,
        actionUrl: notification.actionUrl || notification.ActionUrl
      };

      console.log('🔔 NOTIFICATION HUB: Normalized notification:', normalizedNotification);
      console.log('🔔 NOTIFICATION HUB: Calling handlers, count:', this.handlers.onNewNotification.length);

      this.handlers.onNewNotification.forEach(handler => handler(normalizedNotification));
    });

    this.connection.on('UnreadCountUpdate', (count: number) => {
      console.log('🔔 Unread count update:', count);
      this.handlers.onUnreadCountUpdate.forEach(handler => handler(count));
    });

    this.connection.on('ChatUnreadCountUpdate', (data: { chatId: string, unreadCount: number }) => {
      console.log('🔔 Chat unread count update:', data);
      this.handlers.onChatUnreadCountUpdate.forEach(handler => handler(data));
    });

    this.connection.on('NotificationMarkedRead', (notificationId: string) => {
      this.handlers.onNotificationMarkedRead.forEach(handler => handler(notificationId));
    });

    this.connection.on('NotificationHandled', (notificationId: string) => {
      this.handlers.onNotificationHandled.forEach(handler => handler(notificationId));
    });

    this.connection.on('AllNotificationsMarkedRead', () => {
      this.handlers.onAllNotificationsMarkedRead.forEach(handler => handler());
    });

    this.connection.on('NotificationsLoaded', (data: { notifications: any[], unreadCount: number }) => {
      this.handlers.onNotificationsLoaded.forEach(handler => handler(data));
    });

    this.connection.on('Error', (error: string) => {
      console.error('🔔 NotificationHub error:', error);
      this.handlers.onError.forEach(handler => handler(error));
    });

    // Connection state handlers
    this.connection.onreconnecting(() => {
      console.log('🔔 NotificationHub reconnecting...');
      this.handlers.onConnectionStateChange.forEach(handler => handler(HubConnectionState.Reconnecting));
    });

    this.connection.onreconnected(() => {
      console.log('🔔 NotificationHub reconnected');
      this.connectionAttempts = 0;
      this.handlers.onConnectionStateChange.forEach(handler => handler(HubConnectionState.Connected));
    });

    this.connection.onclose(async () => {
      console.log('🔔 NotificationHub connection closed');
      this.handlers.onConnectionStateChange.forEach(handler => handler(HubConnectionState.Disconnected));
      
      if (!this.isDestroyed && this.connectionEnabled && this.connectionAttempts < this.maxReconnectAttempts) {
        this.connectionAttempts++;
        console.log(`🔔 Attempting to reconnect NotificationHub (${this.connectionAttempts}/${this.maxReconnectAttempts})`);
        
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
      console.log('🔔 NotificationHub connected successfully');
      this.connectionAttempts = 0;
      this.handlers.onConnectionStateChange.forEach(handler => handler(HubConnectionState.Connected));
    } catch (error) {
      console.error('🔔 NotificationHub connection failed:', error);
      this.handlers.onConnectionStateChange.forEach(handler => handler(HubConnectionState.Disconnected));
      
      if (!this.isDestroyed && this.connectionEnabled && this.connectionAttempts < this.maxReconnectAttempts) {
        this.connectionAttempts++;
        this.reconnectTimer = setTimeout(() => {
          this.startConnection();
        }, 5000);
      }
    }
  }

  // Public methods
  setHandlers(handlers: NotificationHandlers, componentId: string = 'default') {
    // Initialize set for this component if it doesn't exist
    if (!this.handlerSets.has(componentId)) {
      this.handlerSets.set(componentId, new Set());
    }
    const componentHandlers = this.handlerSets.get(componentId)!;

    // Add handlers to arrays only if they haven't been added before by this component
    if (handlers.onNewNotification && !componentHandlers.has(handlers.onNewNotification)) {
      this.handlers.onNewNotification.push(handlers.onNewNotification);
      componentHandlers.add(handlers.onNewNotification);
    }
    if (handlers.onUnreadCountUpdate && !componentHandlers.has(handlers.onUnreadCountUpdate)) {
      this.handlers.onUnreadCountUpdate.push(handlers.onUnreadCountUpdate);
      componentHandlers.add(handlers.onUnreadCountUpdate);
    }
    if (handlers.onChatUnreadCountUpdate && !componentHandlers.has(handlers.onChatUnreadCountUpdate)) {
      this.handlers.onChatUnreadCountUpdate.push(handlers.onChatUnreadCountUpdate);
      componentHandlers.add(handlers.onChatUnreadCountUpdate);
    }
    if (handlers.onNotificationMarkedRead && !componentHandlers.has(handlers.onNotificationMarkedRead)) {
      this.handlers.onNotificationMarkedRead.push(handlers.onNotificationMarkedRead);
      componentHandlers.add(handlers.onNotificationMarkedRead);
    }
    if (handlers.onNotificationHandled && !componentHandlers.has(handlers.onNotificationHandled)) {
      this.handlers.onNotificationHandled.push(handlers.onNotificationHandled);
      componentHandlers.add(handlers.onNotificationHandled);
    }
    if (handlers.onAllNotificationsMarkedRead && !componentHandlers.has(handlers.onAllNotificationsMarkedRead)) {
      this.handlers.onAllNotificationsMarkedRead.push(handlers.onAllNotificationsMarkedRead);
      componentHandlers.add(handlers.onAllNotificationsMarkedRead);
    }
    if (handlers.onNotificationsLoaded && !componentHandlers.has(handlers.onNotificationsLoaded)) {
      this.handlers.onNotificationsLoaded.push(handlers.onNotificationsLoaded);
      componentHandlers.add(handlers.onNotificationsLoaded);
    }
    if (handlers.onError && !componentHandlers.has(handlers.onError)) {
      this.handlers.onError.push(handlers.onError);
      componentHandlers.add(handlers.onError);
    }
    if (handlers.onConnectionStateChange && !componentHandlers.has(handlers.onConnectionStateChange)) {
      this.handlers.onConnectionStateChange.push(handlers.onConnectionStateChange);
      componentHandlers.add(handlers.onConnectionStateChange);
    }
  }

  removeHandlers(componentId: string = 'default') {
    if (!this.handlerSets.has(componentId)) return;
    
    const componentHandlers = this.handlerSets.get(componentId)!;
    
    // Remove all handlers registered by this component
    componentHandlers.forEach(handler => {
      this.handlers.onNewNotification = this.handlers.onNewNotification.filter(h => h !== handler);
      this.handlers.onUnreadCountUpdate = this.handlers.onUnreadCountUpdate.filter(h => h !== handler);
      this.handlers.onChatUnreadCountUpdate = this.handlers.onChatUnreadCountUpdate.filter(h => h !== handler);
      this.handlers.onNotificationMarkedRead = this.handlers.onNotificationMarkedRead.filter(h => h !== handler);
      this.handlers.onNotificationHandled = this.handlers.onNotificationHandled.filter(h => h !== handler);
      this.handlers.onAllNotificationsMarkedRead = this.handlers.onAllNotificationsMarkedRead.filter(h => h !== handler);
      this.handlers.onNotificationsLoaded = this.handlers.onNotificationsLoaded.filter(h => h !== handler);
      this.handlers.onError = this.handlers.onError.filter(h => h !== handler);
      this.handlers.onConnectionStateChange = this.handlers.onConnectionStateChange.filter(h => h !== handler);
    });
    
    // Clear the component's handler set
    this.handlerSets.delete(componentId);
  }

  async getNotifications(limit = 20, skip = 0) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('🔔 NotificationHub not connected, cannot get notifications');
      return;
    }

    try {
      await this.connection.invoke('GetNotifications', limit, skip);
    } catch (error) {
      console.error('🔔 Failed to get notifications:', error);
    }
  }

  async markAsRead(notificationId: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('🔔 NotificationHub not connected, cannot mark as read');
      return;
    }

    try {
      await this.connection.invoke('MarkAsRead', notificationId);
    } catch (error) {
      console.error('🔔 Failed to mark as read:', error);
    }
  }

  async markAsHandled(notificationId: string) {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('🔔 NotificationHub not connected, cannot mark as handled');
      return;
    }

    try {
      await this.connection.invoke('MarkAsHandled', notificationId);
    } catch (error) {
      console.error('🔔 Failed to mark as handled:', error);
    }
  }

  async markAllAsRead() {
    if (this.connection?.state !== HubConnectionState.Connected) {
      console.warn('🔔 NotificationHub not connected, cannot mark all as read');
      return;
    }

    try {
      await this.connection.invoke('MarkAllAsRead');
    } catch (error) {
      console.error('🔔 Failed to mark all as read:', error);
    }
  }

  getConnectionState(): HubConnectionState {
    return this.connection?.state ?? HubConnectionState.Disconnected;
  }

  async disconnect() {
    if (this.connection?.state === HubConnectionState.Connected || 
        this.connection?.state === HubConnectionState.Connecting) {
      try {
        console.log('🔔 Disconnecting NotificationHub...');
        await this.connection.stop();
      } catch (error) {
        console.error('🔔 Error disconnecting NotificationHub:', error);
      }
    }
    this.connection = null;
  }

  async reconnect() {
    if (this.isDestroyed || !this.connectionEnabled) return;
    
    if (this.connection?.state === HubConnectionState.Connected) {
      console.log('🔔 NotificationHub already connected');
      return;
    }

    console.log('🔔 Manually reconnecting NotificationHub...');
    this.connectionAttempts = 0;
    await this.startConnection();
  }

  destroy() {
    this.isDestroyed = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection) {
      console.log('🔔 Destroying NotificationHub connection');
      this.connection.stop().catch(console.error);
      this.connection = null;
    }

    this.handlers = {
      onNewNotification: [],
      onUnreadCountUpdate: [],
      onChatUnreadCountUpdate: [],
      onNotificationMarkedRead: [],
      onNotificationHandled: [],
      onAllNotificationsMarkedRead: [],
      onNotificationsLoaded: [],
      onError: [],
      onConnectionStateChange: []
    };
  }
}

// Export singleton instance
export const notificationHub = new NotificationHubService();

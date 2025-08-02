'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useFriendHub } from '../../../hooks/useFriendHub';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Toast } from '../../../components/ui/Toast';
import MusicImage from '../../../components/ui/MusicImage';

interface User {
  id: string;
  username: string;
  avatarUrl?: string;
}

export default function ChatPage() {
  const params = useParams();
  const chatId = params.id as string;
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');

  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isConnected,
    connectionState,
    sendMessage,
    markMessageAsRead,
    getChatMessages,
    getChat
  } = useFriendHub({
    userId: currentUser?.id,
    onError: (error) => addToast(error, 'error')
  });

  // Mock current user - in real app, get from auth context
  useEffect(() => {
    setCurrentUser({
      id: 'current-user-id',
      username: 'CurrentUser'
    });
  }, []);

  const chat = getChat(chatId);
  const chatMessages = getChatMessages(chatId);

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected) return;

    try {
      await sendMessage(chatId, message.trim());
      setMessage('');
      inputRef.current?.focus();
    } catch {
      addToast('Failed to send message', 'error');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  useEffect(() => {
    // Mark messages as read when chat is opened
    if (chatMessages.length > 0) {
      chatMessages
        .filter(msg => !msg.isRead && msg.senderId !== currentUser?.id)
        .forEach(msg => {
          markMessageAsRead(msg.messageId).catch(console.error);
        });
    }
  }, [chatMessages, currentUser?.id, markMessageAsRead]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Chat Not Found</h2>
          <p className="text-gray-400">This chat doesn&apos;t exist or you don&apos;t have access to it.</p>
        </div>
      </div>
    );
  }

  const otherParticipant = chat.participants.find(p => p !== currentUser.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="flex flex-col h-screen">
        {/* Chat Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MusicImage
                src={undefined} // In real app, get other participant's avatar
                alt={otherParticipant || 'Unknown User'}
                className="w-10 h-10 rounded-full"
              />
              <div>
                <h1 className="text-lg font-semibold text-white">
                  {otherParticipant || 'Unknown User'}
                </h1>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                  <span className="text-gray-400">
                    {connectionState === 'Connected' ? 'Online' : connectionState}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="text-gray-400 hover:text-white"
                onClick={() => {/* Add call functionality */}}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                className="text-gray-400 hover:text-white"
                onClick={() => {/* Add video call functionality */}}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </Button>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No messages yet</h3>
              <p className="text-gray-400">Start the conversation by sending a message!</p>
            </div>
          ) : (
            chatMessages.map((msg) => {
              const isOwnMessage = msg.senderId === currentUser.id;
              return (
                <div
                  key={msg.messageId}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-end gap-2 max-w-xs lg:max-w-md ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isOwnMessage && (
                      <MusicImage
                        src={msg.senderAvatar}
                        alt={msg.senderName}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                      />
                    )}
                    <div className={`rounded-2xl px-4 py-2 ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/10 text-white'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      <div className={`flex items-center gap-1 mt-1 text-xs ${
                        isOwnMessage ? 'text-blue-200' : 'text-gray-400'
                      }`}>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isOwnMessage && (
                          <svg className={`w-3 h-3 ${msg.isRead ? 'text-blue-300' : 'text-blue-200'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="bg-white/10 backdrop-blur-sm border-t border-white/20 p-4">
          <div className="flex items-center gap-3">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!isConnected}
              className="flex-1 bg-white/10 border-white/20 text-white placeholder-gray-400"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim() || !isConnected}
              className="px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </Button>
          </div>
          {!isConnected && (
            <p className="text-red-400 text-sm mt-2 text-center">
              Connection lost. Trying to reconnect...
            </p>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
} 
"use client";

import { useEffect, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Toast({ message, type, duration = 5000, onClose, action }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getTypeIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
      case 'info':
        return <InformationCircleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
      default:
        return <ExclamationTriangleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
    }
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-400/30 text-white shadow-lg shadow-green-500/25';
      case 'error':
        return 'bg-gradient-to-r from-red-500 to-red-600 border-red-400/30 text-white shadow-lg shadow-red-500/25';
      case 'info':
        return 'bg-gradient-to-r from-blue-500 to-purple-500 border-blue-400/30 text-white shadow-lg shadow-blue-500/25';
      default:
        return 'bg-gradient-to-r from-gray-700 to-gray-800 border-gray-600/30 text-white shadow-lg shadow-gray-500/25';
    }
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 transform ${
        isVisible ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-full scale-95'
      } ${getTypeStyles()} ${
        action ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : 'hover:scale-102'
      }`}
      onClick={action ? () => {
        action.onClick();
        setIsVisible(false);
        setTimeout(onClose, 300);
      } : undefined}
    >
      <div className="flex items-center space-x-3">
        {getTypeIcon()}
        <span className="text-sm font-semibold flex-1 text-white/95">{message}</span>
        <div className="flex items-center space-x-2">
          {action && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-all duration-200 transform hover:scale-105 backdrop-blur-sm"
            >
              {action.label}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-white/80 hover:text-white text-xl leading-none w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-all duration-200"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    action?: {
      label: string;
      onClick: () => void;
    };
  }>;
  onRemoveToast: (id: string) => void;
}

export function ToastContainer({ toasts, onRemoveToast }: ToastContainerProps) {
  if (!toasts || toasts.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          action={toast.action}
          onClose={() => onRemoveToast(toast.id)}
        />
      ))}
    </div>
  );
} 
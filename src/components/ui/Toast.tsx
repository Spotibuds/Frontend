"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
  onClose: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Toast({ message, type, duration = 5000, onClose, action }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  const closeCallback = useRef(onClose);
  useEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismiss = useCallback(() => {
    if (closing.current) return;
    setIsVisible(false);
    closing.current = setTimeout(() => closeCallback.current(), 300);
  }, []);
  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => {
      clearTimeout(timer);
      if (closing.current) clearTimeout(closing.current);
      closing.current = undefined;
    };
  }, [duration, dismiss]);

  const getTypeIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
      case "error":
        return <XCircleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
      case "info":
        return <InformationCircleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
      default:
        return <ExclamationTriangleIcon className="w-5 h-5 text-white/90 flex-shrink-0" />;
    }
  };

  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return "bg-gradient-to-r from-green-700 to-emerald-700 border-green-400/30 text-white shadow-lg shadow-green-500/25";
      case "error":
        return "bg-gradient-to-r from-red-700 to-red-800 border-red-400/30 text-white shadow-lg shadow-red-500/25";
      case "info":
        return "bg-gradient-to-r from-blue-700 to-purple-700 border-blue-400/30 text-white shadow-lg shadow-blue-500/25";
      default:
        return "bg-gradient-to-r from-gray-700 to-gray-800 border-gray-600/30 text-white shadow-lg shadow-gray-500/25";
    }
  };

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-hidden={!isVisible || undefined}
      inert={!isVisible}
      className={`relative w-full max-w-[calc(100vw-2rem)] rounded-xl p-4 shadow-lg transition-opacity duration-300 motion-reduce:transition-none ${isVisible ? "opacity-100" : "pointer-events-none opacity-0"} ${getTypeStyles()}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {getTypeIcon()}
        <span
          dir="auto"
          className="min-w-0 flex-1 text-sm font-semibold text-white [overflow-wrap:anywhere]"
        >
          {message}
        </span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {action && (
            <button
              onClick={e => {
                e.stopPropagation();
                action.onClick();
                dismiss();
              }}
              className="min-h-11 rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {action.label}
            </button>
          )}
          <button
            onClick={e => {
              e.stopPropagation();
              dismiss();
            }}
            aria-label="Dismiss notification"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
    type: "success" | "error" | "info";
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
    <div className="fixed top-20 right-4 z-50 max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] space-y-2 overflow-y-auto">
      {toasts.map(toast => (
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

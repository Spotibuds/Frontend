"use client";

import React, { useState, useEffect, useRef } from 'react';
import { getProxiedImageUrl } from '@/lib/api';

interface MusicImageProps {
  src?: string;
  alt: string;
  fallbackText?: string;
  className?: string;
  type?: 'square' | 'circle';
  size?: 'small' | 'medium' | 'large' | 'xl';
  priority?: boolean; // For above-the-fold images
  lazy?: boolean; // Enable lazy loading (default: true)
  loadDelay?: number; // Delay before loading (for staggered loading)
}

export default function MusicImage({ 
  src, 
  alt, 
  fallbackText, 
  className = '', 
  type = 'square',
  size = 'medium',
  priority = false,
  lazy = true,
  loadDelay = 0
}: MusicImageProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(!!src);
  const [shouldLoad, setShouldLoad] = useState(!lazy || priority);
  const [canStartLoading, setCanStartLoading] = useState(priority || loadDelay === 0);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout>();

  // Convert Azure Blob URL to proxied URL
  const proxiedSrc = getProxiedImageUrl(src);

  // Handle load delay for staggered loading
  useEffect(() => {
    if (loadDelay > 0 && !priority) {
      const timer = setTimeout(() => {
        setCanStartLoading(true);
      }, loadDelay);
      return () => clearTimeout(timer);
    }
  }, [loadDelay, priority]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && canStartLoading) {
            setShouldLoad(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.1
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, priority, shouldLoad, canStartLoading]);

  useEffect(() => {
    setImageError(false);
    
    // Clear any existing timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    if (proxiedSrc && shouldLoad) {
      // Check if image is already cached before setting loading state
      if (imgRef.current && checkImageCache(imgRef.current)) {
        // Image is cached, don't show loading
        setIsLoading(false);
      } else {
        // Image not cached, show loading
        setIsLoading(true);
        
        // Single check for cached images after DOM is ready
        setTimeout(() => {
          if (imgRef.current && checkImageCache(imgRef.current)) {
            return; // Cache check will handle clearing timeout and loading state
          }
        }, 50); // Reduced to 50ms for faster response
        
        // Safety timeout - if image doesn't load in 10 seconds, stop loading state
        loadingTimeoutRef.current = setTimeout(() => {
          setIsLoading(false);
          setImageError(true);
        }, 10000);
      }
      
      // Preload the image if it's priority
      if (priority) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = proxiedSrc;
        document.head.appendChild(link);
      }
    } else {
      setIsLoading(false);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [proxiedSrc, shouldLoad, priority]);

  const sizeClasses = {
    small: 'w-10 h-10',
    medium: 'w-16 h-16', 
    large: 'w-32 h-32',
    xl: 'w-60 h-60'
  };

  const textSizes = {
    small: 'text-xs',
    medium: 'text-lg',
    large: 'text-2xl', 
    xl: 'text-4xl'
  };

  const gradients = [
    'from-purple-500 to-blue-600',
    'from-green-500 to-blue-600', 
    'from-pink-500 to-purple-600',
    'from-yellow-500 to-red-600',
    'from-blue-500 to-purple-600'
  ];

  const getGradient = (text?: string) => {
    if (!text) return gradients[0];
    const index = text.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const handleImageLoad = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    setIsLoading(false);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    setImageError(true);
    setIsLoading(false);
  };

  const checkImageCache = (img: HTMLImageElement) => {
    if (img.complete && img.naturalWidth > 0) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      setIsLoading(false);
      return true;
    }
    return false;
  };

  const baseClasses = `
    flex items-center justify-center
    bg-gradient-to-br ${getGradient(fallbackText)}
    overflow-hidden relative
    ${type === 'circle' ? 'rounded-full' : 'rounded-lg'}
    ${sizeClasses[size]}
    transition-all duration-200
  `.trim();

  const combinedClasses = `${baseClasses} ${className}`;

  return (
    <div ref={containerRef} className={combinedClasses}>
      {proxiedSrc && !imageError && shouldLoad && (
        <>
          <img
            ref={(el) => {
              if (imgRef.current !== el) {
                imgRef.current = el;
                // Check if image is already cached when ref is set (only once)
                if (el && !checkImageCache(el)) {
                  // If not cached, ensure loading state is correct
                  setIsLoading(true);
                }
              }
            }}
            src={proxiedSrc}
            alt={alt}
            className="w-full h-full object-cover transition-opacity duration-200"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ 
              opacity: isLoading ? 0 : 1,
              transition: 'opacity 0.2s ease-in-out'
            }}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
        </>
      )}
      
      {(!proxiedSrc || imageError || !shouldLoad) && (
        <div className="flex items-center justify-center w-full h-full">
          {!shouldLoad && !priority ? (
            // Placeholder for lazy-loaded images
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/40 rounded-full animate-pulse"></div>
          ) : (
            <span className={`text-white font-bold ${textSizes[size]}`}>
              {fallbackText?.charAt(0)?.toUpperCase() || '♪'}
            </span>
          )}
        </div>
      )}
    </div>
  );
} 
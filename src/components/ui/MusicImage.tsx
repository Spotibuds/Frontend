"use client";

import React, { useState, useEffect } from 'react';
import { getProxiedImageUrl, getImageFallback } from '@/lib/api';

interface MusicImageProps {
  src?: string;
  alt: string;
  fallbackText?: string;
  className?: string;
  type?: 'square' | 'circle';
  size?: 'small' | 'medium' | 'large' | 'xl';
  priority?: boolean;
  lazy?: boolean;
}

export default function MusicImage({ 
  src, 
  alt, 
  fallbackText, 
  className = '', 
  type = 'square',
  size = 'medium',
  priority = false,
  lazy = true
}: MusicImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [debugAttempts, setDebugAttempts] = useState<string[]>([]);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
    setDebugAttempts([]);
    
    if (src) {
      const proxiedSrc = getProxiedImageUrl(src);
      setImageSrc(proxiedSrc || '');
      setDebugAttempts(prev => [...prev, `Original: ${src}`, `Proxied: ${proxiedSrc}`]);
    } else {
      setImageSrc('');
    }
  }, [src]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setDebugAttempts(prev => [...prev, `Failed: ${imageSrc}`]);
    
    if (imageSrc && imageSrc.includes('/api/media/image') && src && !src.includes('/api/media/image')) {
      setImageSrc(src);
      setDebugAttempts(prev => [...prev, `Fallback: ${src}`]);
      setImageError(false);
      setImageLoaded(false);
    } else {
      setImageError(true);
      setImageLoaded(false);
    }
  };

  // Size mappings
  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-32 h-32',
    xl: 'w-48 h-48'
  };

  const textSizes = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-xl',
    xl: 'text-3xl'
  };

  // Type mappings
  const typeClasses = {
    square: 'rounded-lg',
    circle: 'rounded-full'
  };

  const combinedClasses = `
    ${sizeClasses[size]} 
    ${typeClasses[type]} 
    ${className}
    bg-gradient-to-br from-gray-700 to-gray-800 
    flex items-center justify-center 
    overflow-hidden 
    relative
    flex-shrink-0
  `.trim();

  const displayText = fallbackText || getImageFallback(alt, 'album');

  const showDebug = process.env.NODE_ENV === 'development' && (imageError || debugAttempts.length > 0);

  return (
    <div className={combinedClasses} title={showDebug ? debugAttempts.join(' | ') : alt}>
      {imageSrc && !imageError ? (
        <>
          <img
            src={imageSrc}
            alt={alt}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            crossOrigin="anonymous"
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full">
          <span className={`text-white font-bold ${textSizes[size]} mb-1`}>
            {displayText.charAt(0).toUpperCase()}
          </span>
          {showDebug && (
            <span className="text-xs text-red-400 text-center px-1">
              No Image
            </span>
          )}
        </div>
      )}
    </div>
  );
} 
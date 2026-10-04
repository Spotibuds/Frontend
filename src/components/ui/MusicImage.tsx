"use client";
import React, { useState, useEffect } from "react";
import { getProxiedImageUrl, getImageFallback, API_CONFIG, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
interface MusicImageProps {
  src?: string;
  alt: string;
  fallbackText?: string;
  className?: string;
  type?: "square" | "circle";
  size?: "small" | "medium" | "large" | "xl";
  priority?: boolean;
  lazy?: boolean;
}
const MusicImage = React.memo(function MusicImage({
  src,
  alt,
  fallbackText,
  className = "",
  type = "square",
  size = "medium",
  priority = false,
}: MusicImageProps) {
  const [imageSrc, setImageSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setFailed(false);
    setImageSrc("");
    const url = getProxiedImageUrl(src || "");
    if (url.startsWith(`${API_CONFIG.USER_API}/`) || url.startsWith(`${API_CONFIG.MUSIC_API}/`)) {
      void apiRequest<Blob>(url, { signal: controller.signal })
        .then(blob => {
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setImageSrc(objectUrl);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else setImageSrc(url);
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  const sizes = { small: "w-12 h-12", medium: "w-16 h-16", large: "w-32 h-32", xl: "w-48 h-48" };
  return (
    <div
      className={cn(
        sizes[size],
        type === "circle" ? "rounded-full" : "rounded-lg",
        "bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0",
        className
      )}
    >
      {/* Protected avatars use authenticated object URLs; the optimizer cannot send a bearer. */}
      {imageSrc && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={alt}
          className="w-full h-full object-cover"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span role="img" aria-label={alt} className="text-white font-bold">
          {(fallbackText || getImageFallback(alt, "album")).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
});
export default MusicImage;

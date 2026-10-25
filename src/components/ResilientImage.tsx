import React, { useState } from 'react';

interface ResilientImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: string;
  fallbackLabel?: string;
}

export function ResilientImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackIcon = 'apartment',
  fallbackLabel,
}: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-highest text-on-surface-variant p-3 text-center select-none ${className}`}
      >
        <span className="material-symbols-outlined text-[28px] text-primary opacity-80">
          {fallbackIcon}
        </span>
        {fallbackLabel && (
          <span className="text-label-sm mt-1 line-clamp-1 opacity-85">{fallbackLabel}</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

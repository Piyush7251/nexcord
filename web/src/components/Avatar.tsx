import React from 'react';
import type { User, UserStatus } from '../types';

interface AvatarProps {
  user?: Partial<User> | null;
  name?: string;
  color?: string;
  size?: number;
  status?: UserStatus;
  showStatus?: boolean;
  speaking?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const Avatar: React.FC<AvatarProps> = ({
  user,
  name,
  color,
  size = 36,
  status,
  showStatus = false,
  speaking = false,
  className = '',
  onClick,
}) => {
  const displayName = user?.displayName || name || user?.username || '?';
  const bg = user?.avatarColor || color || '#5865F2';
  const resolvedStatus = status ?? user?.status ?? 'offline';
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const dotSize = Math.max(8, Math.round(size * 0.3));

  return (
    <div
      className={`nc-avatar-wrap ${speaking ? 'speaking' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={displayName} className="nc-avatar-img" />
      ) : (
        <div
          className="nc-avatar-fallback"
          style={{ background: bg, fontSize: Math.max(11, Math.round(size * 0.38)) }}
        >
          {initials}
        </div>
      )}
      {showStatus && (
        <span
          className={`nc-status-dot status-${resolvedStatus}`}
          style={{ width: dotSize, height: dotSize }}
          title={resolvedStatus}
        />
      )}
    </div>
  );
};

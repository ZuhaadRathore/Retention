import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const MuscleIcon: React.FC<IconProps> = ({ className = '', size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M6 2c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h1v11c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V9h1c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v3h-2V4c0-1.1-.9-2-2-2H6z" />
  </svg>
);

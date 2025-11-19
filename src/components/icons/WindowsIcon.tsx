import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const WindowsIcon: React.FC<IconProps> = ({ className = '', size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 5.45v5.4h8.55V3L3 5.45zm0 13.1L11.55 21v-7.95H3v5.5zm9.45 2.45L21 23V12.9h-8.55V21zm0-18.45v7.95H21V2l-8.55 1.55z" />
  </svg>
);

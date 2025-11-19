import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const LightBulbIcon: React.FC<IconProps> = ({ className = '', size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M9 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 22h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.993 4.993 0 0 0 18 8c0-2.76-2.24-5-5-5S8 5.24 8 8c0 1.38.56 2.63 1.5 3.5.76.76 1.23 1.52 1.41 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

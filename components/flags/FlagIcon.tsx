import React from 'react';

export type SupportedCountry = 'NG' | 'GH' | 'KE' | 'ZA';

interface FlagIconProps {
  country: SupportedCountry;
  className?: string;
  size?: number;
}

export function FlagIcon({ country, className = '', size = 20 }: FlagIconProps) {
  const width = size;
  const height = Math.round((size * 3) / 4);

  switch (country) {
    case 'NG':
      // Nigeria: Green - White - Green vertical tricolor
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 40"
          width={width}
          height={height}
          className={`rounded-xs overflow-hidden shadow-2xs inline-block shrink-0 ${className}`}
          role="img"
          aria-label="Flag of Nigeria"
        >
          <rect width="20" height="40" fill="#008751" />
          <rect x="20" width="20" height="40" fill="#FFFFFF" />
          <rect x="40" width="20" height="40" fill="#008751" />
        </svg>
      );

    case 'GH':
      // Ghana: Red - Gold - Green horizontal with central black star
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 40"
          width={width}
          height={height}
          className={`rounded-xs overflow-hidden shadow-2xs inline-block shrink-0 ${className}`}
          role="img"
          aria-label="Flag of Ghana"
        >
          <rect width="60" height="13.33" fill="#D40026" />
          <rect y="13.33" width="60" height="13.33" fill="#FFCE00" />
          <rect y="26.66" width="60" height="13.34" fill="#006B3F" />
          {/* Black Star */}
          <polygon
            points="30,14 32.5,21.5 40,21.5 34,26 36,33 30,28.5 24,33 26,26 20,21.5 27.5,21.5"
            fill="#000000"
          />
        </svg>
      );

    case 'KE':
      // Kenya: Black - White - Red - White - Green with Maasai shield
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 40"
          width={width}
          height={height}
          className={`rounded-xs overflow-hidden shadow-2xs inline-block shrink-0 ${className}`}
          role="img"
          aria-label="Flag of Kenya"
        >
          <rect width="60" height="11" fill="#000000" />
          <rect y="11" width="60" height="2" fill="#FFFFFF" />
          <rect y="13" width="60" height="14" fill="#BB0000" />
          <rect y="27" width="60" height="2" fill="#FFFFFF" />
          <rect y="29" width="60" height="11" fill="#006600" />
          {/* Maasai Shield Center Piece */}
          <ellipse cx="30" cy="20" rx="4.5" ry="8" fill="#BB0000" stroke="#FFFFFF" strokeWidth="0.8" />
          <ellipse cx="30" cy="20" rx="1.5" ry="6" fill="#000000" />
        </svg>
      );

    case 'ZA':
      // South Africa: Iconic multi-color Y-shape flag
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 40"
          width={width}
          height={height}
          className={`rounded-xs overflow-hidden shadow-2xs inline-block shrink-0 ${className}`}
          role="img"
          aria-label="Flag of South Africa"
        >
          <rect width="60" height="20" fill="#E03C31" />
          <rect y="20" width="60" height="20" fill="#001489" />
          <polygon points="0,0 25,20 0,40" fill="#000000" />
          <polyline points="0,0 25,20 0,40" fill="none" stroke="#FFB81C" strokeWidth="3" />
          <polygon points="0,2 22,20 0,38" fill="#000000" />
          <polygon points="0,0 20,20 60,20 60,14 26,14 12,0" fill="#007749" stroke="#FFFFFF" strokeWidth="1.5" />
          <polygon points="0,40 20,20 60,20 60,26 26,26 12,40" fill="#007749" stroke="#FFFFFF" strokeWidth="1.5" />
          <rect x="25" y="16" width="35" height="8" fill="#007749" />
        </svg>
      );

    default:
      return null;
  }
}

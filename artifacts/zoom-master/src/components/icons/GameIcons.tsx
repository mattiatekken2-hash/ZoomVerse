export function TrophyIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe566" />
          <stop offset="55%" stopColor="#ffc200" />
          <stop offset="100%" stopColor="#e07b00" />
        </linearGradient>
        <linearGradient id="tg-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd740" />
          <stop offset="100%" stopColor="#c47a00" />
        </linearGradient>
        <filter id="tg-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#tg-glow)">
        <path d="M9 3h10v9a5 5 0 0 1-10 0V3z" fill="url(#tg-body)" />
        <path d="M5 5h4v2H6v2H5V5z" fill="#ffc200" />
        <path d="M5 9h1v2h3v2H7a4 4 0 0 1-2-3.5V9z" fill="#e09000" />
        <path d="M19 5h4v4a4 4 0 0 1-2 3.5h-1V11h3V9h-1V5z" fill="#ffc200" />
        <path d="M10 14.5h8v1h-8z" fill="#e09000" />
        <path d="M11 15.5h6v1h-6z" fill="#c47a00" />
        <rect x="9" y="16.5" width="10" height="2" rx="1" fill="url(#tg-base)" />
        <rect x="8" y="18.5" width="12" height="2" rx="1" fill="#c47a00" />
        <path d="M12 5.5l.6 1.8h1.9l-1.5 1.1.6 1.8-1.6-1.2-1.6 1.2.6-1.8-1.5-1.1h1.9L12 5.5z" fill="rgba(255,255,255,0.55)" />
        <path d="M10 4h1v6h-1z" fill="rgba(255,255,255,0.18)" rx="0.5" />
        <rect x="17" y="7" width="1" height="1" fill="rgba(255,255,255,0.35)" />
      </g>
    </svg>
  );
}

export function CosmicChestIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ch-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6f91" />
          <stop offset="100%" stopColor="#c8005a" />
        </linearGradient>
        <linearGradient id="ch-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7b3fa0" />
          <stop offset="100%" stopColor="#3a0a6e" />
        </linearGradient>
        <filter id="ch-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#ch-glow)">
        <rect x="4" y="13" width="20" height="11" rx="2" fill="url(#ch-body)" />
        <rect x="4" y="6" width="20" height="9" rx="2" fill="url(#ch-lid)" />
        <rect x="4" y="13" width="20" height="2" fill="#ff3378" />
        <rect x="11" y="12" width="6" height="4" rx="1.5" fill="#ffd700" />
        <rect x="12.5" y="13.5" width="3" height="1" rx="0.5" fill="#b37a00" />
        <rect x="5" y="15" width="4" height="1.5" rx="0.5" fill="rgba(255,255,255,0.12)" />
        <rect x="19" y="15" width="4" height="1.5" rx="0.5" fill="rgba(255,255,255,0.12)" />
        <path d="M9 8.5l.4 1.2h1.3l-1 .7.4 1.2-1.1-.8-1.1.8.4-1.2-1-.7h1.3L9 8.5z" fill="rgba(255,255,255,0.5)" />
        <rect x="14" y="7.5" width="1" height="1" fill="rgba(255,255,255,0.4)" />
        <rect x="17" y="9" width="1" height="1" fill="rgba(255,255,255,0.3)" />
        <path d="M5 8h1v6H5z" fill="rgba(255,255,255,0.1)" />
      </g>
    </svg>
  );
}

export function SpaceTicketIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tk-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb347" />
          <stop offset="100%" stopColor="#e07000" />
        </linearGradient>
        <filter id="tk-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#tk-glow)">
        <rect x="2" y="8" width="24" height="12" rx="2.5" fill="url(#tk-body)" />
        <circle cx="8.5" cy="14" r="3" fill="rgba(0,0,0,0.25)" />
        <rect x="13" y="10" width="9" height="1.5" rx="0.75" fill="rgba(255,255,255,0.45)" />
        <rect x="13" y="12.5" width="6" height="1.5" rx="0.75" fill="rgba(255,255,255,0.3)" />
        <rect x="13" y="15" width="7.5" height="1.5" rx="0.75" fill="rgba(255,255,255,0.25)" />
        <line x1="11" y1="8" x2="11" y2="20" stroke="rgba(0,0,0,0.2)" strokeWidth="1" strokeDasharray="2 2" />
        <rect x="2" y="13" width="24" height="2" fill="rgba(0,0,0,0.1)" />
        <rect x="3" y="9" width="2" height="10" rx="1" fill="rgba(255,255,255,0.12)" />
        <path d="M6 12l.4 1H7.5l-.9.7.4 1-.9-.7-.9.7.4-1L4.6 13h1.1L6 12z" fill="rgba(255,255,255,0.6)" />
      </g>
    </svg>
  );
}

export function OrbitLinkIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ol-g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe566" />
          <stop offset="100%" stopColor="#ffc200" />
        </linearGradient>
        <filter id="ol-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#ol-glow)">
        <ellipse cx="14" cy="14" rx="11" ry="5.5" stroke="url(#ol-g1)" strokeWidth="1.5" fill="none" />
        <ellipse cx="14" cy="14" rx="5.5" ry="11" stroke="#ffd74080" strokeWidth="1.5" fill="none" />
        <circle cx="14" cy="14" r="3.5" fill="url(#ol-g1)" />
        <circle cx="14" cy="14" r="2" fill="rgba(255,255,255,0.3)" />
        <circle cx="25" cy="14" r="2" fill="#ffd740" />
        <circle cx="14" cy="3" r="1.5" fill="#ffc200" />
      </g>
    </svg>
  );
}

export function SpeedBoltIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bolt-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e676" />
          <stop offset="100%" stopColor="#00a854" />
        </linearGradient>
        <filter id="bolt-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#bolt-glow)">
        <path d="M17 3L8 16h7l-4 9 13-13h-8L17 3z" fill="url(#bolt-g)" />
        <path d="M15 3L9 14h5.5L12 21l9-9h-6L15 3z" fill="rgba(255,255,255,0.2)" />
      </g>
    </svg>
  );
}

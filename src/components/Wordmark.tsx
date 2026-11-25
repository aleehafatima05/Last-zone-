import React from 'react';

interface WordmarkProps {
  compact?: boolean;
}

export const Wordmark: React.FC<WordmarkProps> = ({ compact = false }) => {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        viewBox="0 0 56 56"
        className={compact ? 'w-9 h-9 shrink-0' : 'w-14 h-14 shrink-0'}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="lzSunGrad" cx="50%" cy="60%" r="55%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="65%" stopColor="#d95d24" />
            <stop offset="100%" stopColor="#8c1d18" />
          </radialGradient>
        </defs>
        <circle cx="28" cy="28" r="24" fill="url(#lzSunGrad)" stroke="#d95d24" strokeWidth="1.5" />
        {/* Horizon terrain silhouette */}
        <path
          d="M6 36 L14 31 L20 35 L36 35 L43 30 L50 36 L48 44 L28 52 L8 44 Z"
          fill="#141619"
        />
        {/* Operative silhouette standing in horizon */}
        <path
          d="M25 36 L26 25 L24 23 L26 17 L28 15 L30 17 L32 23 L30 25 L31 36 Z"
          fill="#141619"
        />
        {/* Crosshair ticks */}
        <path
          d="M28 4 V10 M4 28 H10 M46 28 H52"
          stroke="#ECEBE6"
          strokeOpacity="0.55"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-extrabold tracking-[0.12em] text-[#ECEBE6] drop-shadow ${
            compact ? 'text-xl' : 'text-4xl sm:text-5xl'
          }`}
        >
          LAST <span className="text-[#D93824]">ZONE</span>
        </span>
        {!compact && (
          <span className="text-[11px] font-semibold tracking-[0.28em] uppercase text-[#C7C6C0] mt-1">
            Survive the Collapse
          </span>
        )}
      </div>
    </div>
  );
};

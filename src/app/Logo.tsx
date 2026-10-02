import { useId } from 'react';

/** Aztex mark: a faceted glass "A" with a gradient core and soft bloom. */
export function Logo({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="logo">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3EE6A8" />
          <stop offset="0.55" stopColor="#4CC9F0" />
          <stop offset="1" stopColor="#8B7CFF" />
        </linearGradient>
        <linearGradient id={`lh-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#lg-${id})`} />
      <rect x="1" y="1" width="38" height="19" rx="11" fill={`url(#lh-${id})`} opacity="0.5" />
      <path d="M11 30 20 9l9 21h-5.2L20 20.6 16.2 30z" fill="#03140D" opacity="0.88" />
      <path d="M17.6 25.4h4.8" stroke="#03140D" strokeWidth="2.2" strokeLinecap="round" opacity="0.88" />
    </svg>
  );
}

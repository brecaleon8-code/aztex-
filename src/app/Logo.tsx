/** Aztex mark: a royal-green tile with a white "A" — the brand's one solid use of colour. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="logo">
      <rect width="24" height="24" rx="6" fill="#0F6B4B" />
      <path d="M5.8 18.5 12 5l6.2 13.5h-3.3L12 11.8l-2.9 6.7z" fill="#FFFFFF" />
      <rect x="9.7" y="14.6" width="4.6" height="1.5" fill="#FFFFFF" />
    </svg>
  );
}

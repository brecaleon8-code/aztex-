/** Aztex mark: a square amber key with a cut "A" — terminal-function-key styling. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="logo">
      <rect width="24" height="24" fill="var(--amber)" />
      <path d="M5.5 19 12 4.5 18.5 19h-3.6L12 12.2 9.1 19z" fill="var(--on-accent)" />
      <rect x="9.6" y="15.2" width="4.8" height="1.6" fill="var(--on-accent)" />
    </svg>
  );
}

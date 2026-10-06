/**
 * Aztex brand marks, rebuilt as vectors from the master artwork (1440×1040 PNG, measured).
 * Geometry is in the artwork's pixel space offset to the wordmark's bounding box (620×135).
 * Letters and the X's centre cell use `currentColor` (ink on light, paper on dark); the eight
 * outer X cells are the brand green.
 */
export const BRAND_GREEN = '#1F8A6E';
export const BRAND_INK = '#16130F';
export const BRAND_PAPER = '#F4F4F0';

const CELL = 27; // pixel-X cell size
const STEP = 27.25; // pixel-X grid pitch
const X0 = 484; // pixel-X origin (x) within the wordmark box
/** 5×5 grid cells of the X: 'g' = brand green, 'c' = centre (ink/paper). */
const X_CELLS: [number, number, 'g' | 'c'][] = [
  [0, 0, 'g'], [4, 0, 'g'],
  [1, 1, 'g'], [3, 1, 'g'],
  [2, 2, 'c'],
  [1, 3, 'g'], [3, 3, 'g'],
  [0, 4, 'g'], [4, 4, 'g'],
];

const A_OUTER = 'M32 0H82L115 134H88.5L81 104H33L25.5 134H0Z';
const A_COUNTER = 'M55 15H59L75.5 82H38.5Z';
const Z = 'M133 0H222V31.5L153.6 112H223V134H131V102.2L200.8 22H133Z';
const T = 'M242 0H344V22H304V134H281V22H242Z';
const E = 'M367 0H451V22H390V56H446V77H390V112H452V134H367Z';

function PixelX({ x0 = 0, green = BRAND_GREEN, centre = 'currentColor' }: { x0?: number; green?: string; centre?: string }) {
  return (
    <>
      {X_CELLS.map(([c, r, k]) => (
        <rect key={`${c}-${r}`} x={x0 + c * STEP} y={r * STEP} width={CELL} height={CELL} fill={k === 'g' ? green : centre} />
      ))}
    </>
  );
}

/** Full "AZTEX" wordmark. `height` sets the cap height in px; width follows the 620:135 ratio. */
export function Wordmark({ height = 16, title = 'Aztex' }: { height?: number; title?: string }) {
  return (
    <svg className="wordmark" height={height} width={(height * 620) / 136} viewBox="0 0 620 136" role="img" aria-label={title}>
      <path d={A_OUTER + A_COUNTER} fillRule="evenodd" fill="currentColor" />
      <path d={Z} fill="currentColor" />
      <path d={T} fill="currentColor" />
      <path d={E} fill="currentColor" />
      <PixelX x0={X0} />
    </svg>
  );
}

/** The pixel "X" on its own — favicon, compact headers, loading states. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-4 -4 144 144" aria-hidden className="logo">
      <PixelX />
    </svg>
  );
}

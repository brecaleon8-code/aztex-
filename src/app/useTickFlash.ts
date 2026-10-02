import { useEffect, useRef, useState } from 'react';

/**
 * Returns a class that replays a brief up/down glow whenever `value` changes, plus a key that
 * forces the animation to restart on consecutive moves in the same direction.
 */
export function useTickFlash(value: number): { cls: string; key: number } {
  const prev = useRef(value);
  const [state, setState] = useState({ cls: '', key: 0 });
  useEffect(() => {
    if (value === prev.current) return;
    const dir = value > prev.current ? 'tick-up' : 'tick-down';
    prev.current = value;
    setState((s) => ({ cls: dir, key: s.key + 1 }));
  }, [value]);
  return state;
}

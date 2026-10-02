import { useEffect, useState } from 'react';
import { Logo } from './Logo';

/** One-time brand reveal per session. Never blocks input (pointer-events: none). */
export function Intro() {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() => {
    try {
      return sessionStorage.getItem('aztex.intro') ? 'done' : 'in';
    } catch {
      return 'done';
    }
  });
  useEffect(() => {
    if (phase !== 'in') return;
    try {
      sessionStorage.setItem('aztex.intro', '1');
    } catch {
      /* ignore */
    }
    const a = setTimeout(() => setPhase('out'), 1100);
    const b = setTimeout(() => setPhase('done'), 1900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [phase]);
  if (phase === 'done') return null;
  return (
    <div className={`intro ${phase}`} aria-hidden>
      <div className="intro-mark">
        <Logo size={64} />
        <span className="intro-word">AZTEX</span>
        <span className="intro-line" />
      </div>
    </div>
  );
}

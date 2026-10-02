import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
  size?: 'md' | 'lg';
  thumbClassName?: string;
  ariaLabel?: string;
  className?: string;
}

/** Pill container with a sliding active-state background (spec §3). */
export function Segmented<T extends string>({ options, value, onChange, full, size = 'md', thumbClassName = '', ariaLabel, className = '' }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const btn = root.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(value)}"]`);
      if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div ref={ref} role="group" aria-label={ariaLabel} className={`seg ${full ? 'full' : ''} ${size === 'lg' ? 'lg' : ''} ${className}`}>
      {thumb && <span className={`seg-thumb ${thumbClassName}`} style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => (
        <button key={o.value} type="button" className="seg-btn" data-value={o.value} aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

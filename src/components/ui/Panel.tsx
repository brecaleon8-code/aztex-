import { useRef, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

export interface PanelDragProps {
  draggable: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}

interface PanelProps {
  /** Terminal function mnemonic shown in the title bar (e.g. GP, ALLQ). */
  code?: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  style?: CSSProperties;
  /** When provided, the header becomes the drag handle for reordering. */
  drag?: PanelDragProps;
  testId?: string;
}

export function Panel({ code, title, sub, actions, children, className = '', bodyClassName = '', flush, style, drag, testId }: PanelProps) {
  // Controls inside the header (buttons, selects) must not start a panel drag.
  const fromControl = useRef(false);
  return (
    <section className={`panel ${className}`} style={style} data-testid={testId}>
      <header
        className={`panel-head ${drag ? 'draggable' : ''}`}
        draggable={drag?.draggable}
        onMouseDown={(e) => (fromControl.current = !!(e.target as HTMLElement).closest('.panel-actions'))}
        onDragStart={(e) => {
          if (fromControl.current) {
            e.preventDefault();
            return;
          }
          drag?.onDragStart(e);
        }}
        onDragEnd={drag?.onDragEnd}
      >
        {drag && <GripVertical size={12} className="grip" aria-hidden />}
        {code && <span className="panel-code">{code}</span>}
        <h2 className="panel-title">{title}</h2>
        {sub && <span className="panel-sub">{sub}</span>}
        <div className="spacer" />
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      <div className={`panel-body ${flush ? 'flush' : ''} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

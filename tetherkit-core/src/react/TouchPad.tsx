import { useRef, type PointerEvent, type ReactNode } from 'react';
import type { TetherController } from '../controller';

export interface TouchPadProps {
  controller: TetherController;
  /** Feed single-finger drags into the controller's trackpad (touch input mode). */
  trackpad: boolean;
  onSwipe?: (direction: 'left' | 'right') => void;
  /** Called with incremental scale factors (>1 = fingers spreading). */
  onPinch?: (factor: number) => void;
  className?: string;
  label?: string;
  /** 'pan-y' keeps vertical scrolling (e.g. a notes panel) while detecting horizontal swipes. */
  touchAction?: 'none' | 'pan-y';
  children?: ReactNode;
}

interface Gesture {
  startX: number;
  startY: number;
  startT: number;
  pinchDistance: number | null;
  pinched: boolean;
}

/**
 * Pointer-events surface used for the Touch Trackpad fallback, horizontal
 * swipes and two-finger pinch. Works with mouse too (Split-View emulator).
 */
export function TouchPad({
  controller,
  trackpad,
  onSwipe,
  onPinch,
  className,
  label,
  touchAction = 'none',
  children,
}: TouchPadProps) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const distance = (): number => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startX: event.clientX, startY: event.clientY, startT: performance.now(), pinchDistance: null, pinched: false };
      controller.touchStart();
    } else if (pointers.current.size === 2 && gesture.current) {
      gesture.current.pinchDistance = distance();
    }
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 1 && trackpad) {
      const width = event.currentTarget.getBoundingClientRect().width || 320;
      controller.touchMove(next.x - prev.x, next.y - prev.y, width);
    } else if (pointers.current.size === 2 && gesture.current) {
      const d = distance();
      const g = gesture.current;
      if (g.pinchDistance && d > 0) {
        const factor = d / g.pinchDistance;
        if (Math.abs(factor - 1) > 0.02) {
          g.pinched = true;
          g.pinchDistance = d;
          onPinch?.(factor);
        }
      }
    }
  };

  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 1 && g) g.pinchDistance = null;
    if (pointers.current.size > 0) return;
    if (g && !g.pinched && onSwipe) {
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      const dt = performance.now() - g.startT;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && dt < 600) onSwipe(dx < 0 ? 'left' : 'right');
    }
    gesture.current = null;
    controller.touchEnd();
  };

  return (
    <div
      className={`tk-pad ${className ?? ''}`}
      role="application"
      aria-label={label ?? (trackpad ? 'Touch trackpad' : 'Gesture area')}
      style={{ touchAction }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

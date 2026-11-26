import { useEffect, useRef } from 'react';
import type { TetherController } from '../controller';

export interface PoseDotProps {
  controller: TetherController;
  className?: string;
}

/** Live dot that mirrors the controller's current (nx, ny) inside its parent. Updates via rAF, not React state. */
export function PoseDot({ controller, className }: PoseDotProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      const { nx, ny } = controller.getPose();
      el.style.left = `${((nx + 1) / 2) * 100}%`;
      el.style.top = `${((1 - ny) / 2) * 100}%`;
      el.dataset.held = controller.getState().primaryHeld ? '1' : '0';
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [controller]);
  return <div ref={ref} className={`tk-pose-dot ${className ?? ''}`} aria-hidden />;
}

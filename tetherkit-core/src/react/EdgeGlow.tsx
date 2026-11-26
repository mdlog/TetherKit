import { useEffect, useRef } from 'react';
import type { FeedbackDispatcher } from '../feedback/dispatcher';

export interface EdgeGlowProps {
  dispatcher: FeedbackDispatcher;
  color?: string;
}

/** Full-screen edge flash driven by FeedbackDispatcher pulses (the universal haptic stand-in). */
export function EdgeGlow({ dispatcher, color = 'var(--tk-accent)' }: EdgeGlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      dispatcher.onPulse(({ intensity, color: override }) => {
        const el = ref.current;
        if (!el || intensity <= 0) return;
        el.style.setProperty('--tk-glow-color', override ?? color);
        el.animate([{ opacity: intensity }, { opacity: 0 }], {
          duration: 140 + intensity * 220,
          easing: 'ease-out',
        });
      }),
    [dispatcher, color],
  );
  return <div ref={ref} className="tk-edge-glow" aria-hidden />;
}

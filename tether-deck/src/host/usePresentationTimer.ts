import { useCallback, useEffect, useState } from 'react';

export interface PresentationTimer {
  running: boolean;
  elapsedSec: number;
  start(): void;
  toggle(): void;
  reset(): void;
}

interface TimerState {
  /** Wall-clock ms when the current run started; null while paused. */
  startedAt: number | null;
  /** Milliseconds accumulated by previous runs. */
  banked: number;
}

/** Wall-clock presentation timer with 1-second resolution. */
export function usePresentationTimer(): PresentationTimer {
  const [timer, setTimer] = useState<TimerState>({ startedAt: null, banked: 0 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.startedAt]);

  const running = timer.startedAt !== null;
  const elapsedMs = timer.banked + (timer.startedAt !== null ? Math.max(0, now - timer.startedAt) : 0);

  const start = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setTimer((s) => (s.startedAt === null ? { ...s, startedAt: t } : s));
  }, []);

  const toggle = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setTimer((s) =>
      s.startedAt === null ? { ...s, startedAt: t } : { startedAt: null, banked: s.banked + (t - s.startedAt) },
    );
  }, []);

  const reset = useCallback(() => setTimer({ startedAt: null, banked: 0 }), []);

  return { running, elapsedSec: Math.floor(elapsedMs / 1000), start, toggle, reset };
}

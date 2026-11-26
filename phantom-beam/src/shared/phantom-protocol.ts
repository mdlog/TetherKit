/**
 * App-level contract between the phantom-beam host and the phone EMF reader,
 * layered on TetherProtocol. Spec: .kiro/specs/phantom-beam/design.md
 */
export type Phase = 'lobby' | 'playing' | 'won' | 'lost';
export type LostReason = 'sanity' | 'time' | null;

export const PhantomAction = {
  start: 'game_start',
  restart: 'game_restart',
} as const;

export interface PhantomSync extends Record<string, unknown> {
  phase: Phase;
  lostReason: LostReason;
  timeLeft: number;
  sanity: number;
  score: number;
  banished: number;
  total: number;
  /** 0-1 UV Surge progress on the locked ghost. */
  progress: number;
  /** Beam is locked on a revealed ghost (10° acquire cone, 14° hold hysteresis). */
  locked: boolean;
  touching: boolean;
  /** Metres walked into the corridor. */
  depth: number;
  /** The player is currently advancing. */
  walking: boolean;
  /** Increments on every jump scare; the phone shows its own scare when it changes. */
  scare: number;
  /** Which entity caused the latest scare. */
  scareKind: 'wraith' | 'mimic';
  /** Jump scares enabled (desktop toggle). */
  scares: boolean;
}

export const initialPhantomSync: PhantomSync = {
  phase: 'lobby',
  lostReason: null,
  timeLeft: 60,
  sanity: 100,
  score: 0,
  banished: 0,
  total: 4,
  progress: 0,
  locked: false,
  touching: false,
  depth: 0,
  walking: false,
  scare: 0,
  scareKind: 'wraith',
  scares: true,
};

export type ScareKind = 'wraith' | 'mimic';

/** EMF meter levels shared by the desktop HUD and the phone LEDs. */
export const EMF_THRESHOLDS = [0.15, 0.35, 0.55, 0.75, 0.9] as const;

export function emfLevel(emf: number): number {
  let level = 0;
  for (const threshold of EMF_THRESHOLDS) if (emf > threshold) level++;
  return level;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

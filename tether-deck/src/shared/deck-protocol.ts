/**
 * App-level contract between the tether-deck host and its phone controller,
 * layered on TetherProtocol (ControlAction names + FeedbackEvent.syncState).
 * Spec: .kiro/specs/tether-deck/design.md
 */
export type DeckMode = 'inspector' | 'slides';

export const DeckAction = {
  next: 'slide_next',
  prev: 'slide_prev',
  setMode: 'mode_set',
  zoom: 'zoom',
  nextModel: 'model_next',
  timerToggle: 'timer_toggle',
  timerReset: 'timer_reset',
} as const;

export interface ModePayload {
  mode: DeckMode;
}

export interface ZoomPayload {
  /** > 1 zooms in, < 1 zooms out. */
  factor: number;
}

export interface DeckSync extends Record<string, unknown> {
  mode: DeckMode;
  slideIndex: number;
  totalSlides: number;
  slideTitle: string;
  notes: string;
  elapsedSec: number;
  remainingSec: number;
  talkSec: number;
  timerRunning: boolean;
  modelName: string;
  modelIndex: number;
  modelCount: number;
}

export const initialDeckSync: DeckSync = {
  mode: 'slides',
  slideIndex: 0,
  totalSlides: 0,
  slideTitle: '',
  notes: '',
  elapsedSec: 0,
  remainingSec: 0,
  talkSec: 0,
  timerRunning: false,
  modelName: '',
  modelIndex: 0,
  modelCount: 0,
};

export function isDeckMode(value: unknown): value is DeckMode {
  return value === 'inspector' || value === 'slides';
}

export function formatClock(totalSec: number): string {
  const sign = totalSec < 0 ? '-' : '';
  const s = Math.abs(Math.round(totalSec));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

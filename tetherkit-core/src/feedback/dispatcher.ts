import type { AudioCue, FeedbackEvent } from '../protocol/types';
import { clamp01 } from '../sensors/math';
import { TactileSynth } from './synth';
import { sanitizeVibrationPattern } from './vibration';

export interface PulseEvent {
  /** 0-1 strength of the edge glow. */
  intensity: number;
  /** Optional CSS color override for this pulse. */
  color?: string;
}

type PulseListener = (pulse: PulseEvent) => void;

const CUE_PULSE: Record<AudioCue, number> = { tick: 0.35, click: 0.3, warning: 0.8, banish: 1 };

/**
 * Turns host feedback into whatever the phone can actually do:
 * - Android: navigator.vibrate() with a sanitized pattern
 * - iOS / desktop / Firefox: Web Audio pulse instead of vibration
 * - everywhere: an edge-glow pulse event for the UI
 */
export class FeedbackDispatcher {
  readonly synth = new TactileSynth();
  vibrationEnabled = true;
  private listeners = new Set<PulseListener>();

  get canVibrate(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  /** Call inside the Connect tap so audio can play later. */
  unlock(): void {
    this.synth.unlock();
  }

  handle(event: FeedbackEvent): void {
    if (event.vibratePattern && event.vibratePattern.length > 0) this.vibrate(event.vibratePattern);
    if (event.audioCue) {
      this.synth.play(event.audioCue);
      this.pulse(CUE_PULSE[event.audioCue]);
    }
  }

  /**
   * Vibrates when supported (and the page has had a user activation);
   * otherwise plays an audio tick. Always emits a visual pulse.
   * @returns true if the hardware motor was used
   */
  vibrate(pattern: number[] | number, fallbackIntensity = 0.6): boolean {
    const safe = sanitizeVibrationPattern(pattern);
    if (safe.length === 0) return false;
    let used = false;
    if (this.vibrationEnabled && this.canVibrate && this.hasUserActivation()) {
      try {
        used = navigator.vibrate(safe);
      } catch {
        used = false;
      }
    }
    if (!used) this.synth.play('tick', fallbackIntensity);
    this.pulse(fallbackIntensity);
    return used;
  }

  /**
   * Motor-only vibration (no audio/visual fallback) for callers that already
   * play their own sound, e.g. a Geiger click loop.
   */
  buzz(pattern: number[] | number): boolean {
    const safe = sanitizeVibrationPattern(pattern);
    if (safe.length === 0 || !this.vibrationEnabled || !this.canVibrate || !this.hasUserActivation()) return false;
    try {
      return navigator.vibrate(safe);
    } catch {
      return false;
    }
  }

  pulse(intensity: number, color?: string): void {
    const event: PulseEvent = { intensity: clamp01(intensity), color };
    for (const listener of this.listeners) listener(event);
  }

  onPulse(listener: PulseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private hasUserActivation(): boolean {
    const activation = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return activation ? activation.hasBeenActive : true;
  }
}

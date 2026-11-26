import type { FeedbackDispatcher } from 'tetherkit-core';
import { EMF_THRESHOLDS } from '../shared/phantom-protocol';

/** Below this EMF the counter stays silent (FR-PHAN-03). */
export const GEIGER_THRESHOLD = EMF_THRESHOLDS[0];

/** Clicks per second for a given EMF: 0 below the threshold, then 1.5 -> ~32 Hz. */
export function geigerRate(emf: number): number {
  if (!(emf > GEIGER_THRESHOLD)) return 0;
  const k = Math.min(1, (emf - GEIGER_THRESHOLD) / (1 - GEIGER_THRESHOLD));
  return 1.5 + 30 * Math.pow(k, 1.6);
}

/** Heartbeat BPM for a given EMF: silent below 0.35, then 64 -> 128. */
export function heartbeatBpm(emf: number): number {
  if (!(emf > 0.35)) return 0;
  const k = Math.min(1, (emf - 0.35) / 0.65);
  return 64 + 64 * k;
}

/** Stereo lean of the whisper/heartbeat, from the beam's horizontal aim (-1 left … +1 right). */
export function leanFromAim(nx: number): number {
  const n = Number.isFinite(nx) ? nx : 0;
  return Math.max(-1, Math.min(1, n * 1.2));
}

/** A barely-audible house creak, panned to the side the entity is on. */
export function creakPan(pan: number, rand: () => number = Math.random): number {
  const p = Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
  return Math.max(-1, Math.min(1, p * 0.8 + (rand() * 2 - 1) * 0.2));
}

const LEVEL_COLORS = ['#39ff88', '#b6ff3b', '#ffd23b', '#ff8a2a', '#ff2a4a'];

/**
 * Phone-side Geiger counter. Clicks follow a Poisson process whose rate rises
 * with EMF, so intervals shorten as a ghost gets closer. Each click is an
 * audio tick + edge-glow pulse; on Android it also buzzes the motor
 * (rate-limited so the motor is not flooded).
 *
 * The same loop drives a heartbeat (a double thump) whose tempo rises with EMF
 * and which leans stereo toward where the beam points — you feel the ghost
 * before you see it. `pan` is updated from the controller's pointing input.
 */
export class GeigerCounter {
  private emf = 0;
  private pan = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBuzz = 0;
  private running = false;

  constructor(private readonly feedback: FeedbackDispatcher) {}

  setEmf(emf: number): void {
    const wasSilent = geigerRate(this.emf) === 0;
    this.emf = emf;
    // Wake up immediately when crossing the threshold.
    if (this.running && wasSilent && geigerRate(emf) > 0) this.schedule(10);
  }

  /** -1 (aiming left) … +1 (aiming right); steers the heartbeat and creaks. */
  setPan(pan: number): void {
    this.pan = Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(50);
    this.beat();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.beatTimer) clearTimeout(this.beatTimer);
    this.timer = null;
    this.beatTimer = null;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  private tick(): void {
    this.timer = null;
    if (!this.running) return;
    const rate = geigerRate(this.emf);
    if (rate === 0) {
      this.schedule(200); // idle poll
      return;
    }
    this.click();
    // Exponential inter-arrival time (Poisson process), never faster than 22 ms.
    const interval = Math.max(22, (-Math.log(1 - Math.random()) / rate) * 1000);
    this.schedule(interval);
  }

  /** Heartbeat loop: silent when EMF is low, otherwise a lub-dub that speeds up. */
  private beat(): void {
    this.beatTimer = null;
    if (!this.running) return;
    const bpm = heartbeatBpm(this.emf);
    if (bpm > 0) {
      const k = (bpm - 64) / 64;
      this.feedback.synth.thump(0.22 + k * 0.3, this.pan, 58 + k * 10);
      // The "dub" arrives shortly after the "lub" and is softer.
      setTimeout(() => {
        if (this.running) this.feedback.synth.thump(0.14 + k * 0.18, this.pan, 46 + k * 8);
      }, 120);
    }
    // Quiet EMF still needs a slow poll so the beat wakes up when a ghost appears.
    this.beatTimer = setTimeout(() => this.beat(), bpm > 0 ? 60_000 / bpm : 400);
  }

  private click(): void {
    const emf = this.emf;
    const level = EMF_THRESHOLDS.filter((t) => emf > t).length;
    this.feedback.synth.play('tick', 0.35 + emf * 0.65);
    this.feedback.pulse(0.06 + emf * 0.34, LEVEL_COLORS[Math.max(0, level - 1)]);
    const now = performance.now();
    if (emf > 0.3 && now - this.lastBuzz > 70) {
      this.lastBuzz = now;
      this.feedback.buzz(Math.round(8 + emf * 22));
    }
  }
}

import type { AudioCue } from '../protocol/types';
import { clamp01 } from '../sensors/math';

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Procedural Web Audio "haptics": short clicks and pulses that stand in for
 * vibration on iOS / desktop. No audio files are shipped or fetched.
 */
export class TactileSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private vol = 0.8;
  private mute = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get volume(): number {
    return this.vol;
  }

  get muted(): boolean {
    return this.mute;
  }

  /** Create/resume the AudioContext. Call from a user gesture. */
  unlock(): void {
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      // Safari 17+: play through the ringer switch like a media app would.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch {
      /* optional API */
    }
    if (!this.ctx) {
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mute ? 0 : this.vol;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    // A one-sample silent buffer fully unlocks older iOS versions.
    const silent = this.ctx.createBufferSource();
    silent.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    silent.connect(this.ctx.destination);
    silent.start();
  }

  setVolume(volume: number): void {
    this.vol = clamp01(volume);
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.mute = muted;
    this.applyGain();
  }

  play(cue: AudioCue, intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.mute || ctx.state !== 'running') return;
    const k = clamp01(intensity);
    const t = ctx.currentTime + 0.001;
    switch (cue) {
      case 'tick':
        this.noiseBurst(t, 0.012, 0.55 * k + 0.1, 2600);
        this.tone(t, 0.006, 3200, 'square', 0.12 * k + 0.03);
        break;
      case 'click':
        this.tone(t, 0.03, 880, 'sine', 0.28 * k + 0.05);
        break;
      case 'warning':
        this.tone(t, 0.09, 220, 'square', 0.2 * k + 0.05, 170);
        this.tone(t + 0.13, 0.09, 220, 'square', 0.2 * k + 0.05, 170);
        break;
      case 'banish':
        this.tone(t, 0.55, 180, 'sawtooth', 0.22 * k + 0.05, 1400);
        this.tone(t + 0.05, 0.7, 1760, 'sine', 0.12 * k + 0.03, 880);
        this.noiseBurst(t, 0.45, 0.25 * k + 0.05, 900);
        break;
    }
  }

  /** Rising three-note "linked" chime. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.mute || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.001;
    [660, 880, 1320].forEach((freq, i) => this.tone(t + i * 0.07, 0.22, freq, 'sine', 0.18));
  }

  /** Short sine pulse with a custom pitch; useful for app-specific cues. */
  blip(frequency: number, durationSec = 0.04, gain = 0.25): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.mute || ctx.state !== 'running') return;
    this.tone(ctx.currentTime + 0.001, durationSec, frequency, 'sine', clamp01(gain));
  }

  /**
   * Low sine thump with a pitch drop (a heartbeat). `pan` places it in the
   * stereo field (-1 left … +1 right) so a heartbeat can lean toward a ghost.
   */
  thump(gain = 0.4, pan = 0, frequency = 62): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.mute || ctx.state !== 'running') return;
    const when = ctx.currentTime + 0.001;
    const duration = 0.22;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, when);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.55, when + duration);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(clamp01(gain), when + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(env);
    if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan < -1 ? -1 : pan > 1 ? 1 : pan;
      env.connect(panner).connect(this.master);
    } else {
      env.connect(this.master);
    }
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private applyGain(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.mute ? 0 : this.vol, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    when: number,
    duration: number,
    freq: number,
    type: OscillatorType,
    gain: number,
    freqEnd?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, when + duration);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(env).connect(this.master!);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private noiseBurst(when: number, duration: number, gain: number, highpassHz: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpassHz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(when, Math.random() * 0.5);
    src.stop(when + duration + 0.02);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

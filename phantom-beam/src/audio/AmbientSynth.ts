/**
 * Desktop soundscape, 100% procedural Web Audio (no sample files):
 * low detuned drone, filtered wind, footsteps, positional ghost voices
 * (Wraith whispers / Mimic growls, panned left-right by where each ghost is),
 * a heartbeat that speeds up as sanity drops, a hum while UV Surge is held,
 * and stingers (banish, scream, win, lose).
 */
import type { GhostVoice } from '../host/game/voices';

export interface AmbientState {
  playing: boolean;
  sanity: number;
  uvActive: boolean;
}

type Ctor = typeof AudioContext;

interface VoiceNodes {
  kind: GhostVoice['kind'];
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  sources: AudioScheduledSourceNode[];
  /** Mimic only: growl oscillators (pitch follows banish progress). */
  oscs: OscillatorNode[];
  seed: number;
}

export class AmbientSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private uv: { gain: GainNode; osc: OscillatorNode } | null = null;
  private noise: AudioBuffer | null = null;
  private readonly voices = new Map<number, VoiceNodes>();
  private volume = 0.7;
  private muted = false;
  private nextBeat = 0;

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must run inside a user gesture (click / key). */
  unlock(): void {
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const AudioCtor = w.AudioContext ?? w.webkitAudioContext;
    if (!AudioCtor) return;
    if (!this.ctx) {
      this.ctx = new AudioCtor();
      this.build(this.ctx);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyMaster();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
  }

  /** Call every frame with the current game state. */
  update(state: AmbientState, voices: GhostVoice[]): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.wind || !this.uv) return;
    const t = ctx.currentTime;
    const nearest = voices.reduce((m, v) => Math.max(m, v.proximity), 0);
    this.wind.gain.gain.setTargetAtTime(0.05 + nearest * 0.06, t, 0.4);
    this.wind.filter.frequency.setTargetAtTime(380 + Math.sin(t * 0.21) * 160 + nearest * 400, t, 0.5);
    this.uv.gain.gain.setTargetAtTime(state.uvActive ? 0.07 : 0, t, 0.05);
    this.uv.osc.frequency.setTargetAtTime(state.uvActive ? 112 + Math.sin(t * 18) * 6 : 100, t, 0.05);
    this.updateVoices(ctx, state.playing ? voices : [], t);

    // Heartbeat below 70 % sanity: 60 -> 140 bpm.
    if (state.playing && state.sanity < 70 && t >= this.nextBeat) {
      const bpm = 60 + (1 - state.sanity / 70) * 80;
      this.thump(t, 0.5);
      this.thump(t + 0.16, 0.32);
      this.nextBeat = t + 60 / bpm;
    }
  }

  /** A faint house creak, panned to where the entity is. Cheap: one filtered burst. */
  creak(pan: number, proximity: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const t = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);
    const k = Math.max(0.15, Math.min(1, proximity));
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150 + Math.random() * 90, t);
    osc.frequency.exponentialRampToValueAtTime(90 + Math.random() * 40, t + 0.35);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.05 * k, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(env).connect(panner);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  /** One footstep on stone. */
  step(intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const k = Math.max(0.2, Math.min(1, intensity));
    this.tone(t, 0.14, 95 + Math.random() * 20, 'sine', 0.22 * k, 48);
    this.burst(t, 0.07, 0.08 * k, 'lowpass', 900, 600);
  }

  banish(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (const [freq, delay] of [
      [523, 0],
      [659, 0.06],
      [784, 0.12],
      [1046, 0.2],
    ] as const) {
      this.tone(t + delay, 0.9, freq, 'triangle', 0.12);
    }
    this.burst(t, 0.8, 0.25, 'bandpass', 600, 6000);
  }

  /** Short shriek for a ghost touch when jump scares are off or cooling down. */
  shriek(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 0.7, 1400, 'sawtooth', 0.08, 380);
    this.burst(t, 0.6, 0.3, 'bandpass', 3000, 400);
  }

  /** Jump-scare stinger: sub hit + dissonant screaming cluster + noise blast. */
  scream(big = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = big ? 1.6 : 0.9;
    this.tone(t, 0.5, 60, 'sine', 0.6, 28);
    for (const [f, detune] of [
      [880, 1],
      [932, 0.98],
      [1245, 1.03],
      [1661, 0.97],
    ] as const) {
      this.tone(t, dur, f * detune, 'sawtooth', 0.07, (f * detune) / 3);
    }
    this.burst(t, dur, 0.45, 'bandpass', 5000, 700);
  }

  win(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 523, 659, 784, 1046].forEach((freq, i) => this.tone(t + i * 0.12, 1.2, freq, 'sine', 0.12));
  }

  lose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 2.2, 90, 'sawtooth', 0.25, 30);
    this.burst(t, 1.8, 0.3, 'bandpass', 1200, 120);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.voices.clear();
  }

  // ---- positional ghost voices ---------------------------------------------

  private updateVoices(ctx: AudioContext, voices: GhostVoice[], t: number): void {
    const seen = new Set<number>();
    for (const v of voices) {
      seen.add(v.id);
      const nodes = this.voices.get(v.id) ?? this.createVoice(ctx, v);
      const level = Math.pow(v.proximity, 1.6);
      // Whispers "breathe" and wander in pitch; growls pulse.
      const breath = 0.55 + 0.45 * Math.sin(t * (nodes.kind === 'wraith' ? 2.1 : 5.5) + nodes.seed);
      nodes.gain.gain.setTargetAtTime((nodes.kind === 'wraith' ? 0.32 : 0.26) * level * breath, t, 0.06);
      nodes.panner.pan.setTargetAtTime(v.pan, t, 0.08);
      if (nodes.kind === 'wraith') {
        nodes.filter.frequency.setTargetAtTime(1500 + 700 * Math.sin(t * 5.3 + nodes.seed * 2) + v.banish * 2500, t, 0.05);
      } else {
        nodes.filter.frequency.setTargetAtTime(260 + v.proximity * 500 + v.banish * 1800, t, 0.08);
        nodes.oscs.forEach((osc, i) => osc.frequency.setTargetAtTime((i === 0 ? 55 : 82.4) * (1 + v.banish * 2), t, 0.1));
      }
    }
    for (const [id, nodes] of this.voices) {
      if (seen.has(id)) continue;
      nodes.gain.gain.setTargetAtTime(0, t, 0.08);
      for (const src of nodes.sources) src.stop(t + 0.5);
      this.voices.delete(id);
    }
  }

  private createVoice(ctx: AudioContext, v: GhostVoice): VoiceNodes {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();
    const sources: AudioScheduledSourceNode[] = [];
    const oscs: OscillatorNode[] = [];
    filter.connect(gain).connect(panner).connect(this.master!);

    const breath = ctx.createBufferSource();
    breath.buffer = this.noise;
    breath.loop = true;
    breath.connect(filter);
    breath.start(0, Math.random() * 1.5);
    sources.push(breath);

    if (v.kind === 'wraith') {
      filter.type = 'bandpass';
      filter.Q.value = 7;
    } else {
      filter.type = 'lowpass';
      filter.Q.value = 4;
      for (const freq of [55, 82.4]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start();
        sources.push(osc);
        oscs.push(osc);
      }
    }
    const nodes: VoiceNodes = { kind: v.kind, gain, filter, panner, sources, oscs, seed: Math.random() * 10 };
    this.voices.set(v.id, nodes);
    return nodes;
  }

  // ---- graph -------------------------------------------------------------

  private build(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.master = master;
    this.applyMaster();

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;

    // Drone: detuned saws through a low-pass.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;
    droneFilter.connect(droneGain).connect(master);
    for (const freq of [55, 55.6, 82.4]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(droneFilter);
      osc.start();
    }

    // Wind.
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    windSrc.connect(windFilter).connect(windGain).connect(master);
    windSrc.start();
    this.wind = { gain: windGain, filter: windFilter };

    // UV hum.
    const uvOsc = ctx.createOscillator();
    uvOsc.type = 'sawtooth';
    uvOsc.frequency.value = 100;
    const uvFilter = ctx.createBiquadFilter();
    uvFilter.type = 'lowpass';
    uvFilter.frequency.value = 900;
    const uvGain = ctx.createGain();
    uvGain.gain.value = 0;
    uvOsc.connect(uvFilter).connect(uvGain).connect(master);
    uvOsc.start();
    this.uv = { gain: uvGain, osc: uvOsc };
  }

  private applyMaster(): void {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  private thump(when: number, gain: number): void {
    this.tone(when, 0.18, 70, 'sine', gain, 40);
  }

  private tone(when: number, dur: number, freq: number, type: OscillatorType, gain: number, freqEnd?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(env).connect(this.master!);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  private burst(when: number, dur: number, gain: number, type: BiquadFilterType, from: number, to: number): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(from, when);
    filter.frequency.exponentialRampToValueAtTime(to, when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(when, Math.random() * 1.5);
    src.stop(when + dur + 0.05);
  }
}

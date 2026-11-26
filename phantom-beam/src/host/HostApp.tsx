import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FeedbackThrottle, FpsMeter, type ControlAction } from 'tetherkit-core';
import { LinkedBurst, PairingCard, TelemetryHud, VirtualPhoneEmulator, useTetherHost } from 'tetherkit-core/react';
import { AmbientSynth } from '../audio/AmbientSynth';
import { APP_ID, CONTROLLER_URL, ICE_SERVERS, SIBLING_URL, SIGNALING_URL } from '../env';
import {
  PhantomAction,
  emfLevel,
  formatTime,
  initialPhantomSync,
  type PhantomSync,
  type ScareKind,
} from '../shared/phantom-protocol';
import { scareFaceUrl, scaresAllowedByDefault } from '../shared/scare-face';
import { CorridorEngine, STEP_LENGTH } from './CorridorEngine';
import { snapshot, walkedOf } from './game/session';
import type { GameEvent, GameState } from './game/types';
import { creakRate, ghostVoices, type GhostVoice } from './game/voices';

type Hud = PhantomSync & { emf: number; uv: boolean };

interface Scare {
  key: number;
  kind: ScareKind;
  /** The final scare when sanity runs out lasts longer. */
  big: boolean;
}

/** Minimum gap between two jump scares (two ghosts touching at once must not double-scare). */
const SCARE_COOLDOWN_MS = 4000;

export default function HostApp() {
  const { host, state } = useTetherHost({
    app: APP_ID,
    signalingUrl: SIGNALING_URL,
    controllerUrl: CONTROLLER_URL,
    iceServers: ICE_SERVERS,
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CorridorEngine | null>(null);
  const [hud, setHud] = useState<Hud>({ ...initialPhantomSync, emf: 0, uv: false });
  const [fps, setFps] = useState(0);
  const [audio] = useState(() => new AmbientSynth());
  const [audioOn, setAudioOn] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [scaresOn, setScaresOn] = useState(scaresAllowedByDefault);
  const [scare, setScare] = useState<Scare | null>(null);

  // Clear the overlay when its animation is done.
  useEffect(() => {
    if (!scare) return;
    const id = setTimeout(() => setScare(null), scare.big ? 1700 : 1000);
    return () => clearTimeout(id);
  }, [scare]);

  const emulatorOpen = state.emulatorUrl !== null;
  const toggleEmulator = () => (emulatorOpen ? host.stopEmulator() : void host.startEmulator());

  // ---- frame loop glue (engine -> phone feedback, audio, HUD) -------------
  const [loopState] = useState(() => ({
    throttle: new FeedbackThrottle({ minIntervalMs: 66, minDelta: 0.03, heartbeatMs: 250 }),
    fps: new FpsMeter(),
    sentProgress: 0,
    sentKey: '',
    force: true,
    lastHud: 0,
    lastStep: 0,
    lastScareAt: Number.NEGATIVE_INFINITY,
    scareCount: 0,
    scareKind: 'wraith' as ScareKind,
    creakAcc: 0,
  }));
  const loop = useRef(loopState);

  /** Jump scare on both screens (desktop overlay + scream, phone face + heavy buzz via sync). */
  const triggerScare = (kind: ScareKind, big: boolean, now: number): boolean => {
    const l = loop.current;
    if (!scaresOn || (!big && now - l.lastScareAt < SCARE_COOLDOWN_MS)) return false;
    l.lastScareAt = now;
    l.scareCount++;
    l.scareKind = kind;
    l.force = true;
    setScare({ key: now, kind, big });
    audio.scream(big);
    host.sendFeedback({ audioCue: 'warning', vibratePattern: big ? [500, 80, 300, 80, 600] : [300, 80, 300] });
    return true;
  };

  const onFrame = (game: GameState, events: GameEvent[], now: number) => {
    const l = loop.current;
    if (l.fps.tick(now)) setFps(l.fps.fps);
    const viewYaw = engineRef.current?.viewYaw ?? 0;
    const voices = ghostVoices(game, viewYaw);
    audio.update({ playing: game.phase === 'playing', sanity: game.sanity, uvActive: game.uvActive }, voices);

    // Creaks: the nearest entity occasionally betrays itself, panned to its side.
    // Poisson-ish accumulator so the cadence feels random, not metronomic.
    let nearest: GhostVoice | null = null;
    for (const voice of voices) if (!nearest || voice.proximity > nearest.proximity) nearest = voice;
    if (game.phase === 'playing' && nearest) {
      l.creakAcc += creakRate(nearest.proximity) * (1 / 60);
      if (l.creakAcc > 1) {
        l.creakAcc = 0;
        audio.creak(nearest.pan, nearest.proximity);
      }
    } else {
      l.creakAcc = 0;
    }

    // Footsteps while walking.
    const stepIndex = Math.floor(walkedOf(game) / STEP_LENGTH);
    if (stepIndex > l.lastStep) {
      l.lastStep = stepIndex;
      audio.step(Math.min(1, game.walkSpeed / 0.8));
    }

    for (const event of events) {
      switch (event.type) {
        case 'banished':
          host.sendFeedback({ audioCue: 'banish', vibratePattern: [60, 40, 140] });
          audio.banish();
          l.force = true;
          break;
        case 'touch-start':
          if (!triggerScare(event.kind, false, now)) {
            host.sendFeedback({ audioCue: 'warning', vibratePattern: [220] });
            audio.shriek();
          }
          l.force = true;
          break;
        case 'won':
          host.sendFeedback({ vibratePattern: [80, 60, 80, 60, 300] });
          audio.win();
          l.force = true;
          break;
        case 'lost': {
          const toucher = game.ghosts.find((g) => g.state === 'touching');
          if (!(event.reason === 'sanity' && triggerScare(toucher?.kind ?? 'wraith', true, now))) {
            host.sendFeedback({ audioCue: 'warning', vibratePattern: [700] });
          }
          audio.lose();
          l.force = true;
          break;
        }
        default:
          l.force = l.force || event.type === 'spawn';
      }
    }

    // Downstream EMF + state, capped at 15 Hz (FR-PHAN-02).
    const snap: PhantomSync = { ...snapshot(game), scare: l.scareCount, scareKind: l.scareKind, scares: scaresOn };
    const key = `${snap.phase}|${Math.ceil(snap.timeLeft)}|${snap.sanity}|${snap.banished}|${snap.score}|${snap.locked}|${snap.touching}|${snap.depth}|${snap.walking}|${snap.scare}|${snap.scares}`;
    const force = l.force || Math.abs(snap.progress - l.sentProgress) > 0.04 || key !== l.sentKey;
    if (host.isConnected && l.throttle.offer(now, game.emf, force)) {
      host.sendFeedback({ emfIntensity: Math.round(game.emf * 1000) / 1000, syncState: snap });
      l.sentProgress = snap.progress;
      l.sentKey = key;
      l.force = false;
    }

    if (now - l.lastHud > 100) {
      l.lastHud = now;
      setHud({ ...snap, emf: game.emf, uv: game.uvActive });
    }
  };
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const engine = new CorridorEngine(stage, {
      readInput: () => {
        const frame = host.getLatestFrame();
        if (host.isConnected) return { nx: frame.nx, ny: frame.ny, uvHeld: frame.primaryHeld };
        // Attract mode: the beam sweeps by itself until a phone connects.
        const t = performance.now() / 1000;
        return { nx: Math.sin(t * 0.45) * 0.65, ny: Math.sin(t * 0.31) * 0.25 - 0.1, uvHeld: false };
      },
      onFrame: (game, events, now) => onFrameRef.current(game, events, now),
    });
    engineRef.current = engine;
    engine.start();
    // Dev-only automation hook (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __phantomEngine?: CorridorEngine }).__phantomEngine = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [host]);

  useEffect(() => () => audio.dispose(), [audio]);

  const startHunt = () => {
    const engine = engineRef.current;
    if (!engine || engine.game.phase === 'playing') return;
    engine.startHunt();
    loop.current.force = true;
    loop.current.lastStep = 0;
    loop.current.lastScareAt = Number.NEGATIVE_INFINITY;
    setScare(null);
    host.sendFeedback({ audioCue: 'click', vibratePattern: [30, 50, 30] });
  };

  // Phone actions: START HUNT / PLAY AGAIN are synced between both screens.
  const actionRef = useRef<(action: ControlAction) => void>(() => undefined);
  useEffect(() => {
    actionRef.current = (action) => {
      if (action.action === PhantomAction.start || action.action === PhantomAction.restart) startHunt();
    };
  });
  useEffect(() => host.onAction((action) => actionRef.current(action)), [host]);
  useEffect(
    () =>
      host.onConnect(() => {
        loop.current.force = true;
        loop.current.throttle.reset();
      }),
    [host],
  );

  // Desktop audio needs a gesture; any click or key unlocks it.
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      setAudioOn(true);
    };
    const onKey = (event: KeyboardEvent) => {
      unlock();
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) actionRef.current({ v: 1, type: 'action', action: PhantomAction.start });
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', onKey);
    };
  }, [audio]);

  useEffect(() => audio.setVolume(volume), [audio, volume]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);

  const level = emfLevel(hud.emf);
  const vignette = {
    '--pb-danger': hud.phase === 'playing' ? String(1 - hud.sanity / 100) : '0',
    // Chromatic aberration and grain swell with the EMF the reader is picking up.
    '--pb-fear': hud.phase === 'playing' ? String(Math.max(hud.emf, 1 - hud.sanity / 100)) : '0',
  } as CSSProperties;

  return (
    <div className="pb-shell">
      <div className="pb" style={vignette}>
        <div ref={stageRef} className="pb-stage" />
        <div className={`pb-vignette ${hud.touching ? 'is-touching' : ''}`} aria-hidden />
        <div className={`pb-uv-tint ${hud.uv ? 'is-on' : ''}`} aria-hidden />
        <div className="pb-scanlines" aria-hidden />
        <div className="pb-grain" aria-hidden />
        <div className="pb-aberration" aria-hidden />

        <header className="pb-top">
          <div className="pb-brand">
            PHANTOM<span>·</span>BEAM
          </div>
          {hud.phase === 'playing' && (
            <div className="pb-stats" role="status">
              <span className={`pb-stat ${hud.timeLeft <= 10 ? 'is-alert' : ''}`}>
                <small>TIME</small>
                {formatTime(hud.timeLeft)}
              </span>
              <span className="pb-stat">
                <small>SANITY</small>
                <span className="pb-bar">
                  <span style={{ width: `${hud.sanity}%` }} />
                </span>
              </span>
              <span className="pb-stat">
                <small>PURIFIED</small>
                {hud.banished}/{hud.total}
              </span>
              <span className="pb-stat">
                <small>SCORE</small>
                {hud.score}
              </span>
              <span className={`pb-stat ${hud.walking ? 'is-walking' : ''}`}>
                <small>DEPTH</small>
                {hud.depth} m
              </span>
              <span className="pb-stat">
                <small>EMF</small>
                <span className="pb-leds" data-level={level}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= level ? 'on' : ''} />
                  ))}
                </span>
              </span>
            </div>
          )}
          <span className="pb-spacer" />
          <TelemetryHud state={state} fps={fps} />
          <label className="pb-volume">
            <button type="button" className="tk-icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Volume"
            />
          </label>
          <button
            type="button"
            className="pb-toggle"
            aria-pressed={scaresOn}
            onClick={() => setScaresOn((on) => !on)}
            title="Jump scares on both screens"
          >
            SCARES {scaresOn ? 'ON' : 'OFF'}
          </button>
          <a className="pb-sibling" href={SIBLING_URL}>
            tether-deck ↗
          </a>
        </header>

        {hud.phase === 'playing' && (
          <div className={`pb-reticle ${hud.locked ? 'is-locked' : ''}`} aria-hidden>
            <span className="pb-reticle__ring" />
            <i className="pb-reticle__h" />
            <i className="pb-reticle__v" />
          </div>
        )}

        {hud.locked && hud.phase === 'playing' && (
          <div className="pb-lock" aria-hidden>
            <span>TARGET LOCKED</span>
            <span className="pb-lock__bar">
              <span style={{ width: `${hud.progress * 100}%` }} />
            </span>
          </div>
        )}

        {hud.phase === 'lobby' && (
          <section className="pb-overlay">
            <h1 className="pb-title">PHANTOM BEAM</h1>
            <p className="pb-sub">Your phone is the flashlight. The corridor is not empty.</p>
            <ol className="pb-howto">
              <li>Pair a phone with the QR code — or open the Virtual Phone. Turn the lights off.</li>
              <li>You walk deeper into the corridor on your own. Sweep the phone like a flashlight: the EMF meter clicks faster, and whispers come from the side the entity is on.</li>
              <li>Lock the beam on a revealed ghost and hold <b>UV SURGE</b> for 2 seconds — you stop walking, and your phone screen blazes UV.</li>
              <li>Purify all 4 entities in 60 seconds. Don’t let them touch you.</li>
            </ol>
            <button type="button" className="pb-cta" onClick={startHunt}>
              START HUNT
            </button>
            <p className="pb-hint">{state.status === 'connected' ? 'or press START HUNT on your phone' : 'Press Enter to start'}</p>
          </section>
        )}

        {(hud.phase === 'won' || hud.phase === 'lost') && (
          <section className={`pb-overlay pb-overlay--${hud.phase}`}>
            <h1 className="pb-title">
              {hud.phase === 'won' ? 'AREA PURIFIED' : hud.lostReason === 'time' ? 'TIME’S UP' : 'SANITY LOST'}
            </h1>
            <p className="pb-sub">
              {hud.phase === 'won'
                ? 'The corridor falls silent.'
                : hud.lostReason === 'time'
                  ? `${hud.total - hud.banished} entities still roam the halls.`
                  : 'They got too close.'}
            </p>
            <dl className="pb-result">
              <div>
                <dt>Purified</dt>
                <dd>
                  {hud.banished}/{hud.total}
                </dd>
              </div>
              <div>
                <dt>Score</dt>
                <dd>{hud.score}</dd>
              </div>
              <div>
                <dt>Sanity</dt>
                <dd>{hud.sanity}%</dd>
              </div>
            </dl>
            <button type="button" className="pb-cta" onClick={startHunt}>
              PLAY AGAIN
            </button>
          </section>
        )}

        <div className="pb-pairing">
          <PairingCard state={state} emulatorOpen={emulatorOpen} onToggleEmulator={toggleEmulator} title="Pair your EMF reader" />
        </div>
        <LinkedBurst state={state} label="EMF reader linked" />

        {scare && (
          <div key={scare.key} className={`pb-scare ${scare.big ? 'pb-scare--big' : ''}`} aria-hidden>
            <img src={scareFaceUrl(scare.kind)} alt="" />
          </div>
        )}
        {!audioOn && (
          <button type="button" className="pb-audio" onClick={() => audio.unlock()}>
            🔊 Click anywhere to enable sound
          </button>
        )}
      </div>
      <VirtualPhoneEmulator
        src={state.emulatorUrl}
        onClose={() => host.stopEmulator()}
        title="Virtual EMF Reader"
        hint="Drag the pad to sweep the flashlight. Hold UV SURGE (or Space) on a revealed ghost. Enter starts a hunt."
      />
    </div>
  );
}

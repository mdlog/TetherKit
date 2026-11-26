import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ControllerState, TetherController } from 'tetherkit-core';
import { ControllerStatusBar, HoldButton, PoseDot, TouchPad, useSyncState } from 'tetherkit-core/react';
import { GeigerCounter, leanFromAim } from '../audio/GeigerCounter';
import { PhantomAction, formatTime, initialPhantomSync, type ScareKind } from '../shared/phantom-protocol';
import { scareFaceUrl } from '../shared/scare-face';
import { EmfMeter } from './EmfMeter';

export interface PhantomControllerProps {
  controller: TetherController;
  state: ControllerState;
}

/** Phone UI styled as a tactical flashlight + EMF reader. */
export function PhantomController({ controller, state }: PhantomControllerProps) {
  const sync = useSyncState(controller, initialPhantomSync);
  const [emf, setEmf] = useState(0);
  const [geiger] = useState(() => new GeigerCounter(controller.feedback));
  const [muted, setMuted] = useState(false);
  const touch = state.inputSource === 'touch';

  useEffect(() => {
    controller.setTouchBehavior({ springBack: false, holdsPrimary: false });
  }, [controller]);

  useEffect(() => {
    geiger.start();
    return () => geiger.stop();
  }, [geiger]);

  // Steer the heartbeat/whisper stereo field with the beam: lean left when you
  // sweep left. Read every frame from the local input, no network round-trip.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      geiger.setPan(leanFromAim(controller.getPose().nx));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [controller, geiger]);

  useEffect(
    () =>
      controller.onFeedback((event) => {
        if (event.emfIntensity === undefined) return;
        setEmf(event.emfIntensity);
        geiger.setEmf(event.emfIntensity);
      }),
    [controller, geiger],
  );

  // Silence the counter whenever the link drops.
  useEffect(() => {
    if (state.status !== 'connected') {
      setEmf(0);
      geiger.setEmf(0);
    }
  }, [state.status, geiger]);

  useEffect(() => {
    controller.feedback.synth.setMuted(muted);
  }, [controller, muted]);

  // Lock feedback is local to the phone: no extra network round-trip after the sync arrives.
  const wasLocked = useRef(false);
  const chargeMilestone = useRef(0);
  useEffect(() => {
    const acquired = sync.locked && !wasLocked.current;
    if (acquired) {
      // Distinct double pulse: "target acquired". On iPhone this becomes audio + edge glow.
      controller.feedback.vibrate([35, 35, 95], 0.8);
      controller.feedback.synth.play('click', 0.9);
      chargeMilestone.current = 0;
    }
    if (!sync.locked) chargeMilestone.current = 0;
    wasLocked.current = sync.locked;
  }, [controller, sync.locked]);

  useEffect(() => {
    if (!sync.locked || !state.primaryHeld) return;
    const milestone = Math.min(3, Math.floor(sync.progress * 4));
    if (milestone > chargeMilestone.current) {
      chargeMilestone.current = milestone;
      controller.feedback.vibrate([18 + milestone * 10], 0.35 + milestone * 0.12);
    }
  }, [controller, state.primaryHeld, sync.locked, sync.progress]);

  // The UV button unmounts between hunts; make sure it is never left "held".
  const playingNow = sync.phase === 'playing';
  useEffect(() => {
    if (!playingNow) controller.setPrimaryHeld(false);
  }, [controller, playingNow]);

  // Enter starts / restarts the hunt when driving the emulator with a keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') controller.sendAction(PhantomAction.start);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // Phone-side jump scare: the host bumps `scare` on every scare; show the face here too.
  const [phoneScare, setPhoneScare] = useState<{ key: number; kind: ScareKind } | null>(null);
  const lastScare = useRef(sync.scare);
  useEffect(() => {
    if (sync.scare === lastScare.current) return;
    lastScare.current = sync.scare;
    if (!sync.scares || sync.scare === 0) return;
    setPhoneScare({ key: Date.now(), kind: sync.scareKind });
  }, [sync.scare, sync.scares, sync.scareKind]);
  useEffect(() => {
    if (!phoneScare) return;
    const id = setTimeout(() => setPhoneScare(null), 900);
    return () => clearTimeout(id);
  }, [phoneScare]);

  const playing = sync.phase === 'playing';
  const ended = sync.phase === 'won' || sync.phase === 'lost';
  const linked = state.status === 'connected';
  // The screen itself is a light source in a dark room: UV while surging, blood red on contact.
  const uvOn = playing && state.primaryHeld;
  const lightClass = sync.touching && playing ? 'is-touch' : uvOn ? (sync.locked ? 'is-uv is-locked' : 'is-uv') : '';

  return (
    <div className={`pc ${sync.touching ? 'pc--touching' : ''}`}>
      <div
        className={`pc-light ${lightClass}`}
        style={{ '--pc-progress': String(sync.progress) } as CSSProperties}
        aria-hidden
      />
      {phoneScare && (
        <div key={phoneScare.key} className="pc-scare" aria-hidden>
          <img src={scareFaceUrl(phoneScare.kind)} alt="" />
        </div>
      )}
      <ControllerStatusBar controller={controller} state={state} recenterLabel="Recenter beam">
        <button
          type="button"
          className={`pc-haptic ${controller.feedback.canVibrate ? 'has-motor' : 'audio-only'}`}
          onClick={() => controller.feedback.vibrate([45, 35, 90], 0.8)}
          title={controller.feedback.canVibrate ? 'Tap to test the hardware vibration motor' : 'No Vibration API: tap to test the audio and screen-pulse fallback'}
        >
          {controller.feedback.canVibrate ? 'MOTOR · TEST' : 'NO MOTOR · AUDIO'}
        </button>
        <button type="button" className="tk-icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </ControllerStatusBar>
      {!linked && (
        <p className="pc-banner">
          {state.status === 'host-left'
            ? 'The desktop page is gone. Reopen it — this phone reconnects automatically.'
            : state.status === 'error'
              ? state.error
              : 'Linking with the corridor…'}
        </p>
      )}

      <EmfMeter emf={emf} />

      <div className="pc-stats">
        <span className={sync.timeLeft <= 10 && playing ? 'is-alert' : ''}>
          <small>TIME</small>
          {formatTime(sync.timeLeft)}
        </span>
        <span>
          <small>SANITY</small>
          {sync.sanity}%
        </span>
        <span>
          <small>PURIFIED</small>
          {sync.banished}/{sync.total}
        </span>
        <span>
          <small>SCORE</small>
          {sync.score}
        </span>
      </div>

      {touch && (
        <TouchPad controller={controller} trackpad className="pc-pad" label="Flashlight trackpad">
          <PoseDot controller={controller} />
          <span className="pc-pad__hint">Drag to sweep the flashlight</span>
        </TouchPad>
      )}
      {!touch && <div className="pc-spacer" />}

      <footer className="pc-footer">
        {sync.phase === 'lobby' && (
          <button type="button" className="pc-cta" onClick={() => controller.sendAction(PhantomAction.start)} disabled={!linked}>
            START HUNT
          </button>
        )}
        {ended && (
          <div className="pc-result">
            <strong>{sync.phase === 'won' ? 'AREA PURIFIED' : sync.lostReason === 'time' ? 'TIME’S UP' : 'SANITY LOST'}</strong>
            <span>Score {sync.score}</span>
            <button type="button" className="pc-cta" onClick={() => controller.sendAction(PhantomAction.restart)}>
              PLAY AGAIN
            </button>
          </div>
        )}
        {playing && (
          <HoldButton
            className={`pc-uv ${sync.locked ? 'pc-uv--locked' : ''}`}
            label="HOLD: UV SURGE"
            sublabel={sync.locked ? 'LOCKED — keep holding' : 'lock the beam on a ghost'}
            progress={sync.progress}
            onHoldChange={(held) => controller.setPrimaryHeld(held)}
            hotkey=" "
            disabled={!linked}
          />
        )}
      </footer>
    </div>
  );
}

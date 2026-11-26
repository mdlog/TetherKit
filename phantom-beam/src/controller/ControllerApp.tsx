import { useEffect, useState } from 'react';
import { TetherController } from 'tetherkit-core';
import { ConnectScreen, EdgeGlow, LinkedFlash, useTetherController } from 'tetherkit-core/react';
import { ICE_SERVERS, SIGNALING_URL } from '../env';
import { PhantomController } from './PhantomController';

/** `/control` entry for phantom-beam: connect, then the EMF reader. */
export default function ControllerApp() {
  const { controller, state } = useTetherController({
    signalingUrl: SIGNALING_URL,
    iceServers: ICE_SERVERS,
    // A flashlight wants a little more reach than a laser pointer.
    pipeline: { yawRangeDeg: 40, pitchRangeDeg: 30 },
  });
  const [target] = useState(() => TetherController.targetFromSearch());

  // Dev-only automation hook (stripped from production builds).
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __tetherController?: TetherController }).__tetherController = controller;
  }, [controller]);

  useEffect(() => {
    if (target?.kind !== 'emulator') return;
    void controller.connectFromGesture(target);
    const unlock = () => controller.feedback.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [controller, target]);

  const showConnect = state.status === 'idle' || (state.status === 'error' && target?.kind !== 'emulator');

  return (
    <>
      <EdgeGlow dispatcher={controller.feedback} color="#39ff88" />
      <LinkedFlash controller={controller} state={state} label="EMF LINKED" />
      {showConnect ? (
        <ConnectScreen
          controller={controller}
          state={state}
          target={target}
          appName="phantom-beam"
          tagline="Your phone is the flashlight. Something is in the corridor."
          logo={<img src="/favicon.svg" alt="" width={56} height={56} />}
        />
      ) : (
        <PhantomController controller={controller} state={state} />
      )}
    </>
  );
}

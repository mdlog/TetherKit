import { useEffect, useState } from 'react';
import { TetherController } from 'tetherkit-core';
import { ConnectScreen, EdgeGlow, LinkedFlash, useTetherController } from 'tetherkit-core/react';
import { ICE_SERVERS, SIGNALING_URL } from '../env';
import { DeckController } from './DeckController';

/** `/control` entry: connect screen first, then the presenter remote. */
export default function ControllerApp() {
  const { controller, state } = useTetherController({ signalingUrl: SIGNALING_URL, iceServers: ICE_SERVERS });
  const [target] = useState(() => TetherController.targetFromSearch());

  // Dev-only automation hook (stripped from production builds).
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __tetherController?: TetherController }).__tetherController = controller;
  }, [controller]);

  // The Split-View emulator needs no permission prompt: connect right away and
  // unlock audio on the first click inside the iframe.
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
      <EdgeGlow dispatcher={controller.feedback} />
      <LinkedFlash controller={controller} state={state} />
      {showConnect ? (
        <ConnectScreen
          controller={controller}
          state={state}
          target={target}
          appName="tether-deck"
          tagline="Presenter remote · laser pointer · 3D orbit"
          logo={<img src="/favicon.svg" alt="" width={56} height={56} />}
        />
      ) : (
        <DeckController controller={controller} state={state} />
      )}
    </>
  );
}

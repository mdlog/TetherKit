import { useEffect, useRef, useState } from 'react';
import type { ControllerState, TetherController } from '../controller';
import type { TransportMode } from '../protocol/types';
import { transportLabel } from './TransportBadge';

export interface LinkedFlashProps {
  controller: TetherController;
  state: ControllerState;
  label?: string;
}

/**
 * Phone "Linked!" moment: a full-screen flash, a haptic burst and a chime the
 * instant the host acknowledges the link. Haptics go through the dispatcher,
 * so iOS gets the audio + glow fallback.
 */
export function LinkedFlash({ controller, state, label = 'Linked!' }: LinkedFlashProps) {
  const [flash, setFlash] = useState<{ key: number; transport: TransportMode | null } | null>(null);
  const previous = useRef(state.status);

  useEffect(() => {
    const was = previous.current;
    previous.current = state.status;
    if (state.status !== 'connected' || was === 'connected') return;
    setFlash({ key: Date.now(), transport: state.transport });
    controller.feedback.vibrate([20, 40, 20, 40, 70], 0.5);
    controller.feedback.synth.chime();
    controller.feedback.pulse(1);
  }, [controller, state.status, state.transport]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1300);
    return () => clearTimeout(id);
  }, [flash]);

  if (!flash) return null;
  return (
    <div key={flash.key} className="tk-linked-flash" role="status" aria-live="polite">
      <strong>{label}</strong>
      {flash.transport && <span>{transportLabel(flash.transport)}</span>}
    </div>
  );
}

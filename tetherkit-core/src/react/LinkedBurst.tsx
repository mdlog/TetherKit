import { useEffect, useRef, useState } from 'react';
import { TactileSynth } from '../feedback/synth';
import type { HostState } from '../host';
import type { TransportMode } from '../protocol/types';
import { TransportBadge } from './TransportBadge';

export interface LinkedBurstProps {
  state: HostState;
  label?: string;
  /** Play the desktop chime (best effort: browsers may block audio before the first click). */
  sound?: boolean;
}

interface Burst {
  key: number;
  transport: TransportMode;
}

/**
 * Desktop "it's alive" moment: when a controller links, a phone glyph with
 * expanding rings and the transport badge appears for ~2 s, with a chime.
 */
export function LinkedBurst({ state, label = 'Phone linked', sound = true }: LinkedBurstProps) {
  const [burst, setBurst] = useState<Burst | null>(null);
  const previous = useRef(state.status);
  const [synth] = useState(() => new TactileSynth());

  useEffect(() => {
    const was = previous.current;
    previous.current = state.status;
    if (state.status !== 'connected' || was === 'connected' || !state.transport) return;
    setBurst({ key: Date.now(), transport: state.transport });
    if (sound) {
      synth.unlock();
      // Give a just-created AudioContext a moment to resume.
      setTimeout(() => synth.chime(), 60);
    }
  }, [state.status, state.transport, sound, synth]);

  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(null), 2200);
    return () => clearTimeout(id);
  }, [burst]);

  if (!burst) return null;
  return (
    <div key={burst.key} className="tk-linked" role="status" aria-live="polite">
      <div className="tk-linked__rings" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <svg className="tk-linked__phone" viewBox="0 0 40 64" aria-hidden>
        <rect x="3" y="2" width="34" height="60" rx="7" />
        <circle cx="20" cy="54" r="3" />
      </svg>
      <strong className="tk-linked__label">{label}</strong>
      <TransportBadge transport={burst.transport} />
    </div>
  );
}

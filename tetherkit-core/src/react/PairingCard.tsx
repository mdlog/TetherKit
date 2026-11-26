import { useEffect, useState } from 'react';
import { isLoopbackHost } from '../config';
import type { HostState } from '../host';
import { QrCode } from './QrCode';
import { TransportBadge } from './TransportBadge';

export interface PairingCardProps {
  state: HostState;
  emulatorOpen: boolean;
  onToggleEmulator: () => void;
  title?: string;
  className?: string;
}

function statusText(state: HostState): string {
  switch (state.status) {
    case 'connecting':
      return 'Contacting signaling server…';
    case 'waiting':
      return 'Scan with your phone camera';
    case 'negotiating':
      return 'Phone found — opening WebRTC link…';
    case 'connected':
      return 'Controller connected';
    case 'offline':
      return 'Signaling offline — retrying. The emulator still works.';
    case 'error':
      return state.error ?? 'Something went wrong';
    default:
      return 'Starting…';
  }
}

/**
 * QR + 6-character room code + copy link + "Try Virtual Phone" button.
 * Collapses to a slim bar once a controller is connected.
 */
export function PairingCard({ state, emulatorOpen, onToggleEmulator, title = 'Pair a phone', className }: PairingCardProps) {
  const connected = state.status === 'connected';
  const [expanded, setExpanded] = useState(!connected);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setExpanded(!connected);
  }, [connected]);

  const loopback = typeof location !== 'undefined' && isLoopbackHost(location.hostname);
  const code = state.roomId ? `${state.roomId.slice(0, 3)} ${state.roomId.slice(3)}` : '··· ···';

  const copy = async () => {
    if (!state.joinUrl) return;
    try {
      await navigator.clipboard.writeText(state.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link', state.joinUrl);
    }
  };

  const emulatorButton = (
    <button type="button" className="tk-btn tk-btn--primary" onClick={onToggleEmulator} aria-pressed={emulatorOpen}>
      {emulatorOpen ? 'Close Virtual Phone' : 'Try Virtual Phone (Split-View)'}
    </button>
  );

  if (!expanded) {
    return (
      <section className={`tk-card tk-card--slim ${className ?? ''}`} aria-label={title}>
        <TransportBadge transport={state.transport} />
        <span className="tk-card__slim-text">{statusText(state)}</span>
        <button type="button" className="tk-btn tk-btn--ghost" onClick={() => setExpanded(true)}>
          Show QR
        </button>
        {emulatorButton}
      </section>
    );
  }

  return (
    <section className={`tk-card ${className ?? ''}`} aria-label={title}>
      <header className="tk-card__head">
        <h2 className="tk-card__title">{title}</h2>
        <span className={`tk-dot ${state.signalingOnline ? 'tk-dot--ok' : 'tk-dot--warn'}`} title="Signaling" />
        {connected && (
          <button type="button" className="tk-btn tk-btn--ghost tk-btn--small" onClick={() => setExpanded(false)}>
            Hide
          </button>
        )}
      </header>

      <div className="tk-card__qr">
        {state.joinUrl ? (
          <QrCode value={state.joinUrl} size={176} label="Scan to open the phone controller" />
        ) : (
          <div className="tk-card__qr-placeholder" aria-hidden>
            <span className="tk-spinner" />
          </div>
        )}
      </div>

      <div className="tk-card__code" aria-label="Room code">
        {code}
      </div>
      <p className="tk-card__status">{statusText(state)}</p>

      <div className="tk-card__actions">
        <button type="button" className="tk-btn" onClick={copy} disabled={!state.joinUrl}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        {emulatorButton}
      </div>

      {loopback && (
        <p className="tk-note tk-note--warn">
          Phones can’t reach <code>localhost</code>. Open this page through your LAN IP or an HTTPS tunnel to pair a
          real phone — or use the Virtual Phone.
        </p>
      )}
      <p className="tk-note">
        No app install. Open the link in Safari or Chrome (not an in-app browser) for full gyro control.
      </p>
    </section>
  );
}

import type { TransportMode } from '../protocol/types';

const LABELS: Record<TransportMode, string> = { p2p: 'P2P', 'ws-relay': 'RELAY', 'local-emulator': 'EMULATOR' };
const VARIANT: Record<TransportMode, string> = { p2p: 'ok', 'ws-relay': 'warn', 'local-emulator': 'info' };

export function transportLabel(mode: TransportMode | null): string {
  return mode ? LABELS[mode] : 'OFFLINE';
}

export interface TransportBadgeProps {
  transport: TransportMode | null;
  /** Shown when there is no transport (e.g. "LINKING"). */
  idleLabel?: string;
}

/** Green P2P / yellow RELAY / blue EMULATOR pill. */
export function TransportBadge({ transport, idleLabel = 'NO LINK' }: TransportBadgeProps) {
  const variant = transport ? VARIANT[transport] : 'idle';
  return (
    <span className={`tk-badge tk-badge--${variant}`} title={transport ? `Transport: ${transport}` : undefined}>
      <span className="tk-badge__dot" aria-hidden />
      {transport ? LABELS[transport] : idleLabel}
    </span>
  );
}

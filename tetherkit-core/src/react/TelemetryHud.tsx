import type { HostState } from '../host';
import { TransportBadge } from './TransportBadge';

export interface TelemetryHudProps {
  state: HostState;
  /** Render FPS measured by the app's own loop. */
  fps?: number;
  className?: string;
}

/** Compact live link metrics: transport, latency, sensor rate, FPS, phone battery. */
export function TelemetryHud({ state, fps, className }: TelemetryHudProps) {
  const idle =
    state.status === 'negotiating' ? 'LINKING' : state.status === 'offline' ? 'OFFLINE' : 'NO PHONE';
  const battery = state.controllerStatus?.battery;
  const input = state.controllerStatus?.inputSource ?? state.device?.inputSource;
  return (
    <div className={`tk-hud ${className ?? ''}`} role="status" aria-live="polite">
      <TransportBadge transport={state.transport} idleLabel={idle} />
      <span className="tk-hud__metric" title="Estimated one-way latency (RTT / 2)">
        <b>{state.latencyMs !== null ? state.latencyMs.toFixed(1) : '—'}</b> ms
      </span>
      <span className="tk-hud__metric" title="Sensor frames received per second">
        <b>{state.sensorHz}</b> Hz
      </span>
      {fps !== undefined && (
        <span className="tk-hud__metric" title="Render frames per second">
          <b>{fps}</b> fps
        </span>
      )}
      {input && <span className="tk-hud__metric tk-hud__tag">{input === 'gyro' ? 'GYRO' : 'TOUCH'}</span>}
      {battery !== undefined && (
        <span className="tk-hud__metric" title="Phone battery">
          <b>{Math.round(battery * 100)}</b>%
        </span>
      )}
    </div>
  );
}

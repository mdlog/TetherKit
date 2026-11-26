import type { ReactNode } from 'react';
import type { ControllerState, TetherController } from '../controller';
import { TransportBadge } from './TransportBadge';

export interface ControllerStatusBarProps {
  controller: TetherController;
  state: ControllerState;
  recenterLabel?: string;
  children?: ReactNode;
}

function statusLabel(state: ControllerState): string {
  switch (state.status) {
    case 'connected':
      return 'Linked';
    case 'negotiating':
      return 'Linking…';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'host-left':
      return 'Desktop away';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

/** Top strip on every controller: transport, link state, input source switch, recenter. */
export function ControllerStatusBar({ controller, state, recenterLabel = 'Recenter', children }: ControllerStatusBarProps) {
  const canGyro = controller.env.hasOrientationEvent && !controller.env.isInAppBrowser && state.target?.kind === 'room';
  const toggleInput = () => {
    if (state.inputSource === 'gyro') controller.useTouch();
    else void controller.enableSensors(); // runs inside this tap (iOS permission)
  };
  return (
    <header className="tk-statusbar">
      <TransportBadge transport={state.transport} idleLabel={statusLabel(state).toUpperCase()} />
      <span className={`tk-statusbar__state tk-statusbar__state--${state.status}`}>{statusLabel(state)}</span>
      <span className="tk-statusbar__spacer" />
      {children}
      {canGyro && (
        <button type="button" className="tk-btn tk-btn--ghost tk-btn--small" onClick={toggleInput}>
          {state.inputSource === 'gyro' ? 'Gyro' : 'Touch'}
        </button>
      )}
      <button type="button" className="tk-btn tk-btn--small" onClick={() => controller.recenter()}>
        {recenterLabel}
      </button>
    </header>
  );
}

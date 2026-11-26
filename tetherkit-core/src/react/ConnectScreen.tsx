import { useState, type ReactNode } from 'react';
import { TetherController, type ControllerState, type ControllerTarget } from '../controller';
import { isValidRoomCode, normalizeRoomCode } from '../transport/signal-types';

export interface ConnectScreenProps {
  controller: TetherController;
  state: ControllerState;
  appName: string;
  tagline?: string;
  logo?: ReactNode;
  /** Target from the URL; when absent the user types the room code. */
  target: ControllerTarget | null;
}

/**
 * Entry screen of every controller. The single button runs the iOS sensor
 * permission request, audio unlock and wake lock inside one user gesture.
 */
export function ConnectScreen({ controller, state, appName, tagline, logo, target }: ConnectScreenProps) {
  const [code, setCode] = useState(target?.kind === 'room' ? target.roomId : '');
  const [localError, setLocalError] = useState<string | null>(null);
  const env = controller.env;

  // Keep this handler synchronous: requestPermission() must run inside the tap.
  const connect = () => {
    const roomId = normalizeRoomCode(code);
    const chosen: ControllerTarget | null =
      target && (target.kind === 'emulator' || target.roomId === roomId)
        ? target
        : isValidRoomCode(roomId)
          ? { kind: 'room', roomId }
          : null;
    if (!chosen) {
      setLocalError('Enter the 6-character code shown on the desktop.');
      return;
    }
    setLocalError(null);
    void controller.connectFromGesture(chosen);
  };

  const error = localError ?? state.error;

  return (
    <main className="tk-connect">
      <div className="tk-connect__brand">
        {logo}
        <h1>{appName}</h1>
        {tagline && <p>{tagline}</p>}
      </div>

      {env.isInAppBrowser && (
        <p className="tk-note tk-note--warn" role="alert">
          You are inside {env.inAppName}. Motion sensors need Safari or Chrome — use “Open in browser” from the menu.
          The touch trackpad works here too.
        </p>
      )}
      {!env.isSecureContext && (
        <p className="tk-note tk-note--warn" role="alert">
          This page is not served over HTTPS, so the browser blocks motion sensors. Touch trackpad mode will be used.
        </p>
      )}

      <label className="tk-connect__label" htmlFor="tk-room-code">
        Room code
      </label>
      <input
        id="tk-room-code"
        className="tk-connect__code"
        value={code}
        onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
        placeholder="ABC234"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        maxLength={7}
      />

      <button type="button" className="tk-btn tk-btn--primary tk-btn--xl" onClick={connect}>
        Connect &amp; Enable Sensors
      </button>

      {error && (
        <p className="tk-note tk-note--error" role="alert">
          {error}
        </p>
      )}
      <p className="tk-note">
        Your phone stays in your hand: only orientation and button states are sent. No camera, no install.
      </p>
    </main>
  );
}

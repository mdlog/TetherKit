/**
 * TetherProtocol v1 — the message contract shared by every transport
 * (WebRTC DataChannel, WebSocket relay, BroadcastChannel emulator).
 *
 * Source of truth: .kiro/specs/tether-protocol/requirements.md + design.md.
 * When you change a type here, update the spec and run `pnpm test:pbt`.
 */

export const PROTOCOL_VERSION = 1 as const;

export type TransportMode = 'p2p' | 'ws-relay' | 'local-emulator';
export type InputSource = 'gyro' | 'touch';
export type AudioCue = 'tick' | 'banish' | 'warning' | 'click';
export type DevicePlatform = 'ios' | 'android' | 'desktop' | 'other';

/** Controller -> Host, 60 Hz on the unordered `sensor` channel. */
export interface SensorFrame {
  v: 1;
  type: 'sensor';
  /** Monotonic per controller session. Frames with seq <= lastSeq are dropped. */
  seq: number;
  /** Sender `performance.now()` in ms. */
  ts: number;
  inputSource: InputSource;
  /** Normalized horizontal aim in [-1, 1]; +1 = right. */
  nx: number;
  /** Normalized vertical aim in [-1, 1]; +1 = up. */
  ny: number;
  /** Normalized wrist roll in [-1, 1]; +1 = clockwise (right side down). */
  roll: number;
  /** Primary hold button (Grab / Laser / UV Surge). */
  primaryHeld: boolean;
}

/** Controller -> Host discrete action on the ordered `control` channel. */
export interface ControlAction<TPayload = unknown> {
  v: 1;
  type: 'action';
  action: string;
  payload?: TPayload;
}

/** Host -> Controller feedback + state sync on the ordered `control` channel. */
export interface FeedbackEvent {
  v: 1;
  type: 'feedback';
  /** 0.0 - 1.0 */
  emfIntensity?: number;
  /** Sanitized: max 10 entries, each 0-1000 ms, total <= 10000 ms. */
  vibratePattern?: number[];
  audioCue?: AudioCue;
  syncState?: Record<string, unknown>;
}

export interface DeviceInfo {
  platform: DevicePlatform;
  inputSource: InputSource;
  hasVibration: boolean;
  inAppBrowser: boolean;
}

/** Controller -> Host, first message of every session (resets the seq guard). */
export interface HelloMessage {
  v: 1;
  type: 'hello';
  sessionId: string;
  device: DeviceInfo;
}

/** Host -> Controller reply to `hello`. */
export interface HelloAck {
  v: 1;
  type: 'ack';
  app: string;
  sessionId: string;
}

/** Host -> Controller latency probe; the controller echoes `t` back in a pong. */
export interface PingMessage {
  v: 1;
  type: 'ping';
  id: number;
  t: number;
}

export interface PongMessage {
  v: 1;
  type: 'pong';
  id: number;
  t: number;
}

/** Controller -> Host, sent on change and every few seconds. */
export interface StatusMessage {
  v: 1;
  type: 'status';
  inputSource: InputSource;
  calibrated: boolean;
  /** 0-1 when the Battery Status API is available. */
  battery?: number;
  /** Wake Lock currently held. */
  awake?: boolean;
}

export type TetherMessage =
  | SensorFrame
  | ControlAction
  | FeedbackEvent
  | HelloMessage
  | HelloAck
  | PingMessage
  | PongMessage
  | StatusMessage;

export type TetherMessageType = TetherMessage['type'];

/** Payload accepted by `TetherHost.sendFeedback` (envelope fields are added for you). */
export type FeedbackInput = Omit<FeedbackEvent, 'v' | 'type'>;

/** Channel each message type travels on. Sensor frames are the only unordered traffic. */
export function channelFor(type: TetherMessageType): 'sensor' | 'control' {
  return type === 'sensor' ? 'sensor' : 'control';
}

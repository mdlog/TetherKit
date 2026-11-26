import { sanitizeVibrationPattern } from '../feedback/vibration';
import { clamp01, clampUnit, quantize } from '../sensors/math';
import type {
  AudioCue,
  DeviceInfo,
  DevicePlatform,
  FeedbackEvent,
  InputSource,
  SensorFrame,
  StatusMessage,
  TetherMessage,
} from './types';

/** Messages longer than this are rejected before JSON.parse. */
export const MAX_MESSAGE_CHARS = 4096;

const AUDIO_CUES: readonly AudioCue[] = ['tick', 'banish', 'warning', 'click'];
const PLATFORMS: readonly DevicePlatform[] = ['ios', 'android', 'desktop', 'other'];
const ACTION_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function shortString(value: unknown, max = 64): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function inputSource(value: unknown): InputSource | null {
  return value === 'gyro' || value === 'touch' ? value : null;
}

/**
 * Sensor frames use a compact tuple to keep 60 Hz traffic small:
 * [v, "s", seq, ts, src(0 gyro | 1 touch), nx, ny, roll, held(0|1)]
 * Angles are quantized to 1e-4 and timestamps to 0.1 ms.
 */
export function encodeSensorFrame(frame: SensorFrame): string {
  return JSON.stringify([
    1,
    's',
    isSeq(frame.seq) ? frame.seq : 0,
    finite(frame.ts) ? quantize(frame.ts, 1) : 0,
    frame.inputSource === 'touch' ? 1 : 0,
    quantize(clampUnit(frame.nx), 4),
    quantize(clampUnit(frame.ny), 4),
    quantize(clampUnit(frame.roll), 4),
    frame.primaryHeld ? 1 : 0,
  ]);
}

export function encodeMessage(message: TetherMessage): string {
  if (message.type === 'sensor') return encodeSensorFrame(message);
  return JSON.stringify(message);
}

function decodeSensorTuple(data: unknown[]): SensorFrame | null {
  if (data.length !== 9 || data[0] !== 1 || data[1] !== 's') return null;
  const [, , seq, ts, src, nx, ny, roll, held] = data;
  if (!isSeq(seq) || !finite(ts) || (src !== 0 && src !== 1)) return null;
  if (!finite(nx) || !finite(ny) || !finite(roll) || (held !== 0 && held !== 1)) return null;
  return {
    v: 1,
    type: 'sensor',
    seq,
    ts,
    inputSource: src === 1 ? 'touch' : 'gyro',
    nx: clampUnit(nx),
    ny: clampUnit(ny),
    roll: clampUnit(roll),
    primaryHeld: held === 1,
  };
}

function decodeSensorObject(data: Json): SensorFrame | null {
  const source = inputSource(data.inputSource);
  if (!isSeq(data.seq) || !finite(data.ts) || !source) return null;
  if (!finite(data.nx) || !finite(data.ny) || !finite(data.roll) || typeof data.primaryHeld !== 'boolean') return null;
  return {
    v: 1,
    type: 'sensor',
    seq: data.seq,
    ts: data.ts,
    inputSource: source,
    nx: clampUnit(data.nx),
    ny: clampUnit(data.ny),
    roll: clampUnit(data.roll),
    primaryHeld: data.primaryHeld,
  };
}

function decodeFeedback(data: Json): FeedbackEvent {
  const event: FeedbackEvent = { v: 1, type: 'feedback' };
  if (finite(data.emfIntensity)) event.emfIntensity = clamp01(data.emfIntensity);
  if (data.vibratePattern !== undefined) {
    const pattern = sanitizeVibrationPattern(data.vibratePattern);
    if (pattern.length > 0) event.vibratePattern = pattern;
  }
  if (AUDIO_CUES.includes(data.audioCue as AudioCue)) event.audioCue = data.audioCue as AudioCue;
  if (isRecord(data.syncState)) event.syncState = data.syncState;
  return event;
}

function decodeDevice(value: unknown): DeviceInfo {
  const d = isRecord(value) ? value : {};
  return {
    platform: PLATFORMS.includes(d.platform as DevicePlatform) ? (d.platform as DevicePlatform) : 'other',
    inputSource: inputSource(d.inputSource) ?? 'touch',
    hasVibration: d.hasVibration === true,
    inAppBrowser: d.inAppBrowser === true,
  };
}

function decodeStatus(data: Json): StatusMessage | null {
  const source = inputSource(data.inputSource);
  if (!source || typeof data.calibrated !== 'boolean') return null;
  const status: StatusMessage = { v: 1, type: 'status', inputSource: source, calibrated: data.calibrated };
  if (finite(data.battery)) status.battery = clamp01(data.battery);
  if (typeof data.awake === 'boolean') status.awake = data.awake;
  return status;
}

/**
 * Parses and validates any inbound payload. Never throws: malformed, oversized
 * or unknown messages return null. Numeric fields are clamped to their ranges.
 */
export function decodeMessage(raw: unknown): TetherMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_CHARS) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(data)) return decodeSensorTuple(data);
  if (!isRecord(data) || data.v !== 1) return null;

  switch (data.type) {
    case 'sensor':
      return decodeSensorObject(data);
    case 'action': {
      if (typeof data.action !== 'string' || !ACTION_NAME.test(data.action)) return null;
      return data.payload === undefined
        ? { v: 1, type: 'action', action: data.action }
        : { v: 1, type: 'action', action: data.action, payload: data.payload };
    }
    case 'feedback':
      return decodeFeedback(data);
    case 'hello':
      if (!shortString(data.sessionId)) return null;
      return { v: 1, type: 'hello', sessionId: data.sessionId, device: decodeDevice(data.device) };
    case 'ack':
      if (!shortString(data.app) || !shortString(data.sessionId)) return null;
      return { v: 1, type: 'ack', app: data.app, sessionId: data.sessionId };
    case 'ping':
    case 'pong':
      if (!isSeq(data.id) || !finite(data.t)) return null;
      return { v: 1, type: data.type, id: data.id, t: data.t };
    case 'status':
      return decodeStatus(data);
    default:
      return null;
  }
}

// Protocol
export * from './protocol/types';
export { decodeMessage, encodeMessage, encodeSensorFrame, MAX_MESSAGE_CHARS } from './protocol/codec';
export { FrameOrderGuard } from './protocol/seq-guard';

// Sensors
export {
  OneEuroFilter,
  clamp,
  clamp01,
  clampUnit,
  normalizeDelta,
  orientationToPose,
  quantize,
  wrapDeltaDegrees,
  type OneEuroOptions,
  type Pose,
} from './sensors/math';
export { SensorPipeline, type NormalizedPose, type OrientationSample, type PipelineOptions } from './sensors/pipeline';
export { TouchTrackpad, type TrackpadOptions } from './sensors/touch';
export {
  detectEnvironment,
  detectPlatform,
  requestOrientationPermission,
  type BrowserEnvironment,
  type OrientationPermission,
} from './sensors/environment';
export { OrientationSource } from './sensors/orientation-source';

// Feedback
export { FeedbackDispatcher, type PulseEvent } from './feedback/dispatcher';
export { TactileSynth } from './feedback/synth';
export { WakeLockManager } from './feedback/wake-lock';
export { FeedbackThrottle, type ThrottleOptions } from './feedback/throttle';
export {
  sanitizeVibrationPattern,
  MAX_VIBRATION_ENTRIES,
  MAX_VIBRATION_ENTRY_MS,
  MAX_VIBRATION_TOTAL_MS,
} from './feedback/vibration';

// Transport
export * from './transport/signal-types';
export { RtcSession, isWebRtcSupported, SENSOR_CHANNEL_LABEL, CONTROL_CHANNEL_LABEL } from './transport/rtc-session';
export { BroadcastLink, isBroadcastSupported } from './transport/broadcast-link';
export { SignalingClient } from './transport/signaling-client';

// Sessions
export { TetherHost, type HostState, type HostStatus, type TetherHostOptions } from './host';
export {
  TetherController,
  type ControllerState,
  type ControllerStatus,
  type ControllerTarget,
  type TetherControllerOptions,
  type TouchBehavior,
} from './controller';

// Utilities
export * from './config';
export { FpsMeter } from './util/fps';
export { randomId } from './util/ids';

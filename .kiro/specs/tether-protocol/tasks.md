# Implementation Plan — tether-protocol

- [x] 1. Workspace skeleton
  - pnpm workspace with `tetherkit-core`, `signaling-relay`, `tether-deck`, `phantom-beam`; shared `tsconfig.base.json`; MIT `LICENSE`; `.gitignore` that keeps `/.kiro`
  - _Requirements: 11_

- [x] 2. Protocol layer
  - [x] 2.1 Define TetherProtocol v1 types and `channelFor()` (`protocol/types.ts`)
    - _Requirements: 6.1, 6.3_
  - [x] 2.2 Implement compact sensor tuple codec and validating `decodeMessage` (`protocol/codec.ts`)
    - _Requirements: 6.4_
  - [x] 2.3 Implement `FrameOrderGuard`
    - _Requirements: 6.2_
  - [x] 2.4 Property tests P5–P8 (`tests/protocol.pbt.test.ts`)
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 3. Sensor layer
  - [x] 3.1 `wrapDeltaDegrees`, `orientationToPose` (vector-based), `AxisSmoother` (`sensors/math.ts`)
    - _Requirements: 5.2, 5.3_
  - [x] 3.2 `SensorPipeline` with calibrate / auto-calibrate on first sample
    - _Requirements: 5.1, 5.3_
  - [x] 3.3 `TouchTrackpad` fallback
    - _Requirements: 4.2_
  - [x] 3.4 Environment detection + gesture-safe `requestOrientationPermission()`
    - _Requirements: 4.1, 4.3_
  - [x] 3.5 Property tests P1–P4 (`tests/sensor-math.pbt.test.ts`)
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 4. Feedback layer
  - [x] 4.1 `sanitizeVibrationPattern`
    - _Requirements: 8.1_
  - [x] 4.2 `TactileSynth` (procedural tick / click / warning / banish)
    - _Requirements: 8.2_
  - [x] 4.3 `FeedbackDispatcher` (vibrate → audio fallback → edge-glow pulse, plus motor-only `buzz`)
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 4.4 `WakeLockManager` with visibility re-acquire
    - _Requirements: 7.1, 7.2_
  - [x] 4.5 `FeedbackThrottle` (66 ms floor, 0.03 delta, 250 ms heartbeat)
    - _Requirements: 8.4_
  - [x] 4.6 Property tests P9–P10 (`tests/feedback.pbt.test.ts`)
    - _Requirements: 8.1, 8.4_

- [x] 5. Transport layer
  - [x] 5.1 DOM-free relay wire types shared with the server (`transport/signal-types.ts`)
    - _Requirements: 1.1, 3.5_
  - [x] 5.2 `SignalingClient` with keepalive
    - _Requirements: 1.1_
  - [x] 5.3 `RtcSession` with dual DataChannels, ICE queueing, failure detection
    - _Requirements: 2.1, 2.3, 3.2_
  - [x] 5.4 `BroadcastLink` for the emulator
    - _Requirements: 9.1, 9.2_

- [x] 6. Sessions
  - [x] 6.1 `TetherHost`: room + resume, negotiation, 4 s fallback, active-link selection, ping latency, sensor Hz
    - _Requirements: 1, 2, 3, 6.3, 6.5, 9.4_
  - [x] 6.2 `TetherController`: `connectFromGesture`, 60 Hz pump with keepalive, hello/ack, reconnect, status + battery
    - _Requirements: 3.3, 4, 6.1, 7_

- [x] 7. React UI kit
  - [x] 7.1 `useTetherHost`, `useTetherController`, `useSyncState`, `useAnimationFrame`
  - [x] 7.2 `PairingCard` (QR, code, copy link, loopback warning), `VirtualPhoneEmulator`, `TelemetryHud`
    - _Requirements: 1.2, 1.6, 3.4, 9.1_
  - [x] 7.3 `ConnectScreen`, `ControllerStatusBar`, `TouchPad`, `HoldButton`, `EdgeGlow`, `PoseDot`
    - _Requirements: 4, 8.3, 9.3_
  - [x] 7.4 `LinkedBurst` (desktop) + `LinkedFlash` (phone) + `TactileSynth.chime()`; deck drops its own connect buzz
    - _Requirements: 12_

- [x] 8. Signaling relay
  - [x] 8.1 `RoomManager` (in-memory rooms, hashed tokens, resume grace, TTL sweep)
    - _Requirements: 1.1, 1.4, 1.5, 10.1, 10.3, 10.4_
  - [x] 8.2 `SlidingWindowLimiter` + `TokenBucket`
    - _Requirements: 10.2_
  - [x] 8.3 `server.ts`: upgrade path, origin allow-list, message validation, heartbeat, `/healthz`
    - _Requirements: 3.5, 10.5, 10.6_
  - [x] 8.4 Dockerfile (single bundled file) + `fly.toml`

- [x] 9. Verification
  - [x] 9.1 `pnpm test:pbt`: 24 tests / 10 properties green
  - [x] 9.2 `pnpm size`: core 12.1 KB gzip (< 25 KB)
  - [x] 9.3 Browser E2E: emulator, P2P between two contexts, forced ICE failure → RELAY in ~4.9 s

- [x] 9b. Responsiveness pass (from real-phone feedback: "HOLD TO ORBIT feels less responsive than the mouse")
  - [x] Replace the fixed EMA with a One Euro filter driven by `event.timeStamp`; add property P11
    - _Requirements: 5.3, 5.4_
  - [x] Send gyro frames from the orientation event (no timer wait), cap unforced sends at 60 Hz
    - _Requirements: 5.6, 6.1_
  - [x] `recenter({ quiet: true })` for clutch-style grabs
    - _Requirements: 5.5_

- [ ] 10. Post-hackathon
  - [ ] 10.1 Optional TURN credentials endpoint for enterprise networks
  - [ ] 10.2 Multi-controller rooms (out of MVP scope, PRD §5.2)

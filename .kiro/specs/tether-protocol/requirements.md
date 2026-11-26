# Requirements Document — tether-protocol (tetherkit-core + signaling-relay)

## Introduction

`tetherkit-core` is the skeleton SDK that links a phone (Controller) to a desktop web app (Host) with no install. It owns pairing, transports, the sensor pipeline, downstream feedback and a minimal React UI kit. `signaling-relay` is the server that introduces the two peers and relays traffic when peer-to-peer fails. Source: PRD §6.1 (FR-CORE-01..09) and §7 (NFR).

## Glossary

- **Host**: the desktop page running `TetherHost`.
- **Controller**: the phone page at `/control` running `TetherController`.
- **Relay**: the `signaling-relay` WebSocket server.
- **Room**: a 6-character code (alphabet without I, O, 0 or 1) plus a session token. It holds one Host and at most one Controller.
- **SensorFrame**: the 60 Hz upstream message (`nx`, `ny`, `roll` in [-1, 1] and `primaryHeld`).
- **FeedbackEvent**: the downstream message (EMF intensity, vibration pattern, audio cue, `syncState`).
- **Emulator**: the Split-View virtual phone, which is the real Controller page inside an iframe linked through `BroadcastChannel`.

## Requirements

### Requirement 1 — Room creation and pairing (FR-CORE-01)

**User Story:** As a presenter, I want a QR code and a short code on screen, so that my phone can join in one scan.

#### Acceptance Criteria

1. WHEN the Host starts, THE System SHALL connect to the Relay and send `register_host`, and THE Relay SHALL answer with a random 6-character `roomId` and a random session token.
2. WHEN a room is created, THE Host SHALL display a QR code of `/control?room=<roomId>&token=<token>`, the room code in large type, and a "Copy link" action.
3. WHEN the Host page reloads within the same tab session, THE Host SHALL resume the same room (resume token kept in `sessionStorage`) so the QR stays valid.
4. WHEN a Controller joins with only the room code, THE Relay SHALL accept it only if the controller slot is empty. WHEN a Controller joins with a valid token, THE Relay SHALL let it replace the previous controller.
5. IF the token is invalid, THEN THE Relay SHALL reply `BAD_TOKEN`. IF the room does not exist, THEN THE Relay SHALL reply `ROOM_NOT_FOUND`.
6. WHEN the Host is served from `localhost`, THE pairing card SHALL warn that phones cannot reach it and point to the Emulator.

### Requirement 2 — Dual DataChannel WebRTC link (FR-CORE-02)

**User Story:** As a user, I want motion to arrive with minimal delay, so that the pointer feels attached to my hand.

#### Acceptance Criteria

1. WHEN both peers are in a room, THE Relay SHALL send `peer_ready` to both, and THE Host SHALL create an SDP offer with two DataChannels: `tether-sensor` `{ ordered: false, maxRetransmits: 0 }` and `tether-control` `{ ordered: true }`.
2. THE Relay SHALL forward `signal_offer`, `signal_answer` and `signal_ice` only between the two peers of the same room.
3. WHILE the sensor channel's `bufferedAmount` exceeds 32 KB, THE System SHALL drop new sensor frames instead of queueing them.

### Requirement 3 — Automatic relay fallback (FR-CORE-03)

**User Story:** As a judge on a strict network, I want the link to work anyway.

#### Acceptance Criteria

1. IF both DataChannels are not open within 4000 ms of `peer_ready`, THEN THE Host SHALL send `use_relay` and both peers SHALL switch to `relay_frame` messages over the existing WebSocket.
2. IF an established P2P link reports ICE `failed`, or stays `disconnected` for more than 2.5 s, THEN THE System SHALL switch to the relay without user action.
3. IF the Controller never receives an offer within 5.5 s, THEN THE Controller SHALL request the relay itself.
4. WHEN the transport changes, THE Host HUD SHALL show `P2P` (green), `RELAY` (yellow) or `EMULATOR` (blue).
5. THE Relay SHALL reject `relay_frame` payloads larger than 4096 characters with `PAYLOAD_TOO_LARGE`.

### Requirement 4 — Sensor permission flow (FR-CORE-04, FR-CORE-05)

**User Story:** As an iPhone user, I want one button that just works.

#### Acceptance Criteria

1. WHEN the user taps "Connect & Enable Sensors", THE Controller SHALL call `DeviceOrientationEvent.requestPermission()` synchronously within that tap handler (when the API exists), and unlock Web Audio and request the Wake Lock in the same gesture.
2. IF permission is denied, the API is unavailable, the page is not a secure context, or no orientation data arrives within 1.5 s, THEN THE Controller SHALL switch to Touch Trackpad mode.
3. WHEN the User-Agent matches a known in-app browser or iOS WKWebView, THE Controller SHALL show a banner suggesting Safari/Chrome and use Touch Trackpad mode immediately.
4. THE Controller SHALL let the user toggle between gyro and touch at any time.

### Requirement 5 — Recenter and sensor pipeline (FR-CORE-06, NFR)

**User Story:** As a presenter, I want to hold the phone however is comfortable.

#### Acceptance Criteria

1. WHEN the user presses "Recenter", THE Controller SHALL store the current pose as the zero reference, and the next frame with the same orientation SHALL produce `nx = ny = roll = 0`.
2. THE pipeline SHALL compute yaw/pitch from the device's pointing vector and wrap angular deltas to [-180, 180) so crossing 359° → 0° never jumps.
3. THE pipeline SHALL map ±35° (default) to [-1, 1], clamp, and smooth with an adaptive **One Euro filter** (min cutoff 1 Hz, β 8, 0.0015 deadzone). It SHALL suppress tremor when the hand is still and add less lag than the previous fixed EMA (α = 0.35) during fast wrist turns.
4. FOR ALL inputs (including NaN, ±Infinity and extreme values), outputs SHALL be finite and within [-1, 1].
5. WHEN an app calls `recenter({ quiet: true })` right before holding the primary button, THE pose SHALL be zeroed without a haptic tick or `recenter` action (clutch-style grab).
6. WHEN a new orientation event arrives in gyro mode, THE Controller SHALL send the frame immediately rather than on the next timer tick, while never exceeding the 60 Hz send rate for unforced frames.

### Requirement 6 — Frame transport and ordering (NFR resilience)

#### Acceptance Criteria

1. THE Controller SHALL send SensorFrames at up to 60 Hz, skipping unchanged frames but re-sending at least every 250 ms.
2. WHEN a SensorFrame arrives with `seq` ≤ the last accepted `seq`, THE Host SHALL drop it.
3. WHEN a Controller sends `hello`, THE Host SHALL reset the sequence guard, reply `ack`, and make that link active.
4. THE decoder SHALL never throw. It SHALL reject messages longer than 4096 characters and clamp every numeric field into range.
5. IF the active controller is silent for 6 s, THEN THE Host SHALL mark it inactive and fall back to any other live link.

### Requirement 7 — Wake Lock (FR-CORE-07)

#### Acceptance Criteria

1. WHEN the Controller connects to a real room, THE System SHALL request `navigator.wakeLock.request('screen')` inside try/catch.
2. WHEN `visibilitychange` reports `visible` again, THE System SHALL re-acquire the lock.

### Requirement 8 — Downstream feedback (FR-CORE-08, FR-PHAN-02)

**User Story:** As a player, I want to feel the desktop through my phone.

#### Acceptance Criteria

1. WHEN the Controller receives a FeedbackEvent with `vibratePattern`, THE System SHALL sanitize it (≤ 10 entries, each 0–1000 ms, total ≤ 10 000 ms) and call `navigator.vibrate()` when supported and user-activated.
2. IF vibration is unsupported (iOS, Firefox), THEN THE System SHALL play a short Web Audio pulse instead.
3. FOR EVERY vibration or audio cue, THE System SHALL emit an edge-glow pulse event for the UI.
4. THE Host SHALL be able to throttle continuous downstream values so two sends are never closer than 66 ms (≤ 15 Hz), while still sending a heartbeat at least every 250 ms.

### Requirement 9 — Split-View Emulator (FR-CORE-09)

**User Story:** As a judge with only a laptop, I want to try everything on one screen.

#### Acceptance Criteria

1. WHEN the user clicks "Try Virtual Phone (Split-View)", THE Host SHALL open a side panel with the real Controller page in an iframe (`/control?emu=<channel>`), linked via `BroadcastChannel`.
2. THE Emulator SHALL use the identical TetherProtocol strings as the WebRTC and relay transports.
3. THE Emulator SHALL connect without any permission prompt and use Touch Trackpad mode (mouse drag), Space for the primary button, and the arrow keys / Enter for app shortcuts.
4. WHEN the Emulator closes, THE Host SHALL fall back to a live phone link if one exists.

### Requirement 10 — Relay safety (NFR security)

#### Acceptance Criteria

1. THE Relay SHALL keep rooms only in memory and expire them after 15 minutes without activity. A room whose host left SHALL be kept 30 s for resume and then removed.
2. THE Relay SHALL limit new connections to 30/min per IP and room operations (`register_host`, `join_room`) to 30/min per IP. It SHALL limit each connection to 120 msg/s (burst 240) and to 300 signaling messages/min.
3. THE Relay SHALL cap active rooms (default 200) and reply `TOO_MANY_ROOMS` beyond that.
4. THE Relay SHALL store only a SHA-256 hash of each token and compare tokens in constant time.
5. WHERE `ALLOWED_ORIGINS` is configured, THE Relay SHALL reject WebSocket upgrades from other origins.
6. THE Relay SHALL never log or persist sensor payloads.

### Requirement 11 — Size and clarity (NFR bundle)

#### Acceptance Criteria

1. THE minified, gzipped `tetherkit-core` entry (no React UI) SHALL stay below 25 KB. `pnpm size` SHALL fail the build otherwise.
2. THE core SHALL have no runtime dependencies except `qrcode-generator` (React UI only).

### Requirement 12 — Link confirmation moment

**User Story:** As a user who just scanned the QR code, I want an unmistakable signal on both screens that the phone is linked.

#### Acceptance Criteria

1. WHEN the Host's status becomes `connected`, THE UI kit (`LinkedBurst`) SHALL show a phone glyph with expanding rings, a label and the transport badge for about 2 s, and play a chime when audio is allowed.
2. WHEN the Controller's status becomes `connected`, THE UI kit (`LinkedFlash`) SHALL show a full-screen flash with the transport for about 1.3 s. It SHALL also play a haptic burst through `FeedbackDispatcher` (so iOS gets the audio + glow fallback) and a chime.
3. Both SHALL fire again after a reconnect, and SHALL drop their motion when the OS asks for reduced motion.
4. Apps SHALL NOT send their own "connected" vibration as well (no double buzz).
5. Requirement 12 is presentation only: it SHALL NOT add or change any TetherProtocol message.

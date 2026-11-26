# System & Technical Architecture: TetherKit

> Translated from the original Indonesian (`Arsitektur.md`). The original wording is in the git history.

| Architecture Attribute | Detail |
| --- | --- |
| Project | **TetherKit** (Skeleton Crew Reference Architecture) |
| Repository Pattern | pnpm Workspaces Monorepo (Root `/.kiro/` + 1 Core SDK + 1 Signaling Relay + 2 Separate App Folders) |
| Main Stack | TypeScript 5, React 19, Vite, Three.js (`@react-three/fiber` or Vanilla Three.js), WebRTC `RTCDataChannel`, Node.js `ws`, `fast-check` |
| Compliance Target | Kiroween 2026 (`/.kiro` at the root + 2 separate folders for 2 applications + MIT Open Source) |

---

## 1. Architecture Principles

1. **Lean Core, Zero Lock-In (`tetherkit-core`):** All connectivity logic, the message protocol, sensor calibration, and feedback are isolated in a pure TypeScript library that is free of dependencies on any particular game engine. Consumer applications simply use a hook or a `TetherHost` / `TetherController` instance.
2. **Dual-Transport Resilience:** The primary path uses a direct device-to-device **WebRTC DataChannel** to keep latency as low as possible, but every message is also 100% compatible with the **WebSocket Relay** and **BroadcastChannel** (for the Emulator Split-View mode on a single screen).
3. **Graceful Hardware Degradation:** The architecture never assumes that the phone definitely has an active gyroscope or vibration support (`navigator.vibrate`). Every hardware layer is wrapped in an adapter with a fallback path (Touch Trackpad, Web Audio, Visual Pulse).
4. **Spec-Driven & Property-Verified:** The message type contracts and the math angle transformations are defined in `.kiro/specs/` and tested with **Property-Based Testing (`fast-check`)** so that they hold up against corrupted packets, random ordering, or sudden changes at the +/-180 degree angle boundary.

---

## 2. Repository Structure (Full Skeleton Crew Compliance)

Folder placement is made explicit at the root level so that judges can immediately see `/.kiro`, the core skeleton, and the **two separate application folders** on the GitHub main page:

```text
tetherkit/
├── .kiro/                                 # REQUIRED at the root & MUST NOT be in .gitignore
│   ├── hooks/
│   │   ├── sync-protocol-on-spec-save.json
│   │   └── run-core-pbt-on-edit.json
│   ├── specs/
│   │   ├── tether-protocol/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md
│   │   ├── tether-deck/
│   │   │   ├── requirements.md
│   │   │   ├── design.md
│   │   │   └── tasks.md
│   │   └── phantom-beam/
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   └── steering/
│       ├── product.md
│       ├── tech.md
│       ├── structure.md
│       └── sensor-browser-safety.md
├── tetherkit-core/                        # Core skeleton (Skeleton SDK + UI Emulator)
│   ├── src/
│   │   ├── protocol/                      # Schema Zod/TS, frame encoder, seq guard
│   │   ├── transport/                     # WebRTC, WS Relay, BroadcastChannel adapters
│   │   ├── sensors/                       # Gyro normalizer, EMA filter, Touch fallback
│   │   ├── feedback/                      # Vibration + WebAudio + WakeLock manager
│   │   ├── react/                         # useTetherHost, useTetherController, QR & Emulator UI
│   │   └── index.ts
│   ├── tests/
│   │   ├── protocol.pbt.test.ts           # Property-based tests via fast-check
│   │   └── sensor-math.pbt.test.ts
│   └── package.json
├── tether-deck/                           # APPLICATION 1 (Separate Folder): Presenter & 3D Tool
│   ├── src/
│   │   ├── host/                          # Desktop 3D Inspector, Slide Engine, Laser Overlay
│   │   ├── controller/                    # Mobile Presenter UI (Calibrate, Notes, Timer, Buttons)
│   │   ├── assets/                        # Sample .glb models & built-in slide deck
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
├── phantom-beam/                          # APPLICATION 2 (Separate Folder): Asymmetric Horror Game
│   ├── src/
│   │   ├── host/                          # Desktop Corridor Renderer, Ghost AI, Flashlight, EMF Math
│   │   ├── controller/                    # Mobile Flashlight/EMF Meter UI, UV Surge Trigger
│   │   ├── audio/                         # Procedural Geiger & Ambient WebAudio synth
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
├── signaling-relay/                       # Lightweight WebSocket Signaling Server + Relay Fallback
│   ├── src/
│   │   ├── room-manager.ts
│   │   ├── rate-limiter.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
├── LICENSE                                # MIT License (auto-detected by GitHub)
├── README.md                              # Architecture documentation, installation, demo links
├── THIRD_PARTY_NOTICES.md                 # Full disclosure of open-source libraries & assets
├── pnpm-workspace.yaml
└── package.json
```

---

## 3. System Topology & Network Data Flow

```text
+-------------------------------------------------------------------+
| DESKTOP HOST BROWSER                                              |
| [tether-deck] OR [phantom-beam]                                   |
| |-- Host App Engine (Three.js / Game Loop / Slide Deck)           |
| |-- TetherHost (tetherkit-core)                                   |
| |   |-- SensorFrame Receiver (Seq Drop + State Store)             |
| |   |-- FeedbackEmitter (EMF / Slide State -> Controller)         |
| |   '-- Split-View Emulator Drawer (BroadcastChannel mode)        |
+-------+-------------------------+-------------------------+-------+
        | (A) SDP/ICE +           | (B) WebRTC P2P          | (C) Fallback
        |     WS Relay Fallback   |     (Primary Path)      |     Emulator
        v                         |                         v
+-------------------------------+ |                 +---------------+
| SIGNALING & RELAY SERVER      | |                 | Local Tab     |
| (Node.js + ws over TLS/WSS)   | |                 | BroadcastCh   |
| - Room Map (TTL 15 min)       | |                 +-------+-------+
| - SDP / ICE Forwarding        | |                         |
| - Fallback Frame Relay        | |                         |
+---------------+---------------+ |                         |
                ^                 |                         |
                | (WSS)           v (UDP-like & Ordered)    v
+---------------+-------------------------------------------+-------+
| MOBILE CONTROLLER BROWSER                                         |
| URL: https://<app-domain>/control?room=AB12CD&token=...           |
| |-- Permission & WKWebView Gate (iOS requestPermission)           |
| |-- SensorPipeline (Gyro 60Hz + EMA Filter OR Touch Trackpad)     |
| |-- WakeLockManager (navigator.wakeLock + visibilitychange)       |
| '-- FeedbackDispatcher (Vibration API + WebAudio + Edge Glow)     |
+-------------------------------------------------------------------+
```

### 3.1 WebRTC Dual-Channel Configuration

To avoid Head-of-Line blocking (where 1 lost sensor packet holds up the entire queue of subsequent movements), `TetherHost` and `TetherController` open two separate `RTCDataChannel` channels:

| Channel Name | `RTCDataChannelInit` Configuration | Data Direction | Message Type |
| --- | --- | --- | --- |
| `tether-sensor` | `{ ordered: false, maxRetransmits: 0 }` | Controller -> Host | `SensorFrame` 60 Hz (relative orientation, touch delta, hold-button state) |
| `tether-control` | `{ ordered: true }` | Bidirectional (`Host <-> Controller`) | `HandshakeAck`, `RecenterEvent`, `DiscreteAction` (next/prev slide, mode switch), `FeedbackEvent` (EMF, vibration, notes/timer sync) |

---

## 4. In-Depth Design of the Core Module (`tetherkit-core`)

### 4.1 Connection State Machine & Automatic Fallback

```text
[IDLE]
  |
  |-> Host creates room / Controller scans QR
  v
[SIGNALING_CONNECTING] --(WSS connected)--> [JOINED_ROOM]
  |                                               |
  | (Both peers present)                          v
  +------------------------------------> [WEBRTC_NEGOTIATING] (Timer: 4000ms)
                                            |           |
                         ICE + DataChannel  |           |  Timeout 4000ms OR
                         Open < 4000ms      |           |  ICE Failed
                                            v           v
                                    [P2P_CONNECTED]  [WS_RELAY_CONNECTED]
                                            |           |
                                            +-----+-----+
                                                  |
                                                  | (Session active)
                                                  v
                                        [DISCONNECTED / RETRY]

* Parallel Path for Single-Screen Judge Mode:
[IDLE] --(Click "Split-View Emulator")--> [LOCAL_LOOPBACK_CONNECTED via BroadcastChannel]
```

### 4.2 Message Protocol (`TetherProtocol` v1)

All payloads use strict TypeScript types with a sequence counter (`seq`) to guarantee consistency over the unordered channel:

```ts
export type TransportMode = 'p2p' | 'ws-relay' | 'local-emulator';

export interface SensorFrame {
  v: 1;
  type: 'sensor';
  seq: number;        // Monotonically increasing; packets with seq <= lastSeq are dropped
  ts: number;         // Sender's performance.now() for jitter/latency estimation
  inputSource: 'gyro' | 'touch';
  nx: number;         // Normalized pointer/aim coordinate [-1.0, 1.0]
  ny: number;         // Normalized vertical coordinate [-1.0, 1.0]
  roll: number;       // Wrist tilt angle [-1.0, 1.0] (for 3D rotation)
  primaryHeld: boolean; // Action button held (Grab 3D / Laser / UV Surge)
}

export interface ControlAction<TPayload = unknown> {
  v: 1;
  type: 'action';
  action: string;     // Example: 'slide_next', 'slide_prev', 'recenter', 'game_restart'
  payload?: TPayload;
}

export interface FeedbackEvent {
  v: 1;
  type: 'feedback';
  emfIntensity?: number;      // 0.0 - 1.0 (for phantom-beam)
  vibratePattern?: number[];  // Clamped to max 10 elements, total <= 10000 ms
  audioCue?: 'tick' | 'banish' | 'warning' | 'click';
  syncState?: Record<string, unknown>; // E.g.: { slideIndex, notes, remainingSec }
}
```

### 4.3 Sensor Pipeline, Relative Calibration, & iOS/Android Handling

The most common problems in web gyroscope demos are the gimbal lock effect on raw Euler angles (`alpha` 0–360 degrees jumping from 359 to 0) and the phone's initial position not pointing at the screen. `SensorPipeline` solves this in four stages:

1. **Permission & WebView Gate:**
   - Checks for the existence of `DeviceOrientationEvent` and the static method `(DeviceOrientationEvent as any).requestPermission`.
   - Checks the User-Agent patterns of in-app browsers (`FBAN`, `FBAV`, `Instagram`, `Line`, `MicroMessenger`, `WhatsApp`, or detection of a missing `requestPermission` on iOS). If it detects that it is running in `WKWebView`, it shows the instruction banner *"Open in Safari/Chrome for full gyroscope"* and at the same time immediately enables **Touch Trackpad Mode** so the app stays playable without interruption.
2. **Shortest-Angle Delta & Relative Calibration (Zeroing):**
   - When the **Recenter** button is pressed, `originYaw = rawAlpha`, `originPitch = rawBeta`, `originRoll = rawGamma` are stored.
   - The angle difference `deltaYaw` is computed with a shortest wrapping function (shortest angular distance) into the range `[-180, 180]` so that crossing the `0/360` boundary never jumps:
```ts
export function wrapDeltaDegrees(current: number, origin: number): number {
  const diff = ((current - origin + 540) % 360) - 180;
  return diff;
}
```
   - The `deltaYaw` and `deltaPitch` values are mapped to a comfortable angle window (e.g. `+/- 35 deg` -> `[-1, 1]`) and clamped to `[-1, 1]`.
3. **Exponential Moving Average (EMA) + Deadzone:**
   - Applies a light smoothing filter (`smoothed = alpha * raw + (1 - alpha) * prev`, with `alpha = 0.35`) and a micro-deadzone of `0.004` to remove human hand tremor on the laser/flashlight cursor without feeling laggy.
4. **Touch Trackpad Fallback:**
   - A full-screen touch area on the phone translates `pointermove` into proportional increments of `(nx, ny)`. The user can still rotate the 3D model, aim the laser, and sweep the corridor flashlight from a desktop or a device without sensors.

### 4.4 FeedbackDispatcher & WakeLockManager

* **`FeedbackDispatcher`:**
  - Checks runtime support with `typeof navigator.vibrate === 'function'` and makes sure there is sticky user activation before triggering vibration.
  - Sanitizes the vibration pattern (at most 10 numbers, each value <= 1000 ms) so that it is safe from rejection by Android OEM browsers.
  - On iOS/Desktop (or when Audio mode is active), triggers a Web Audio API synthesizer (`OscillatorNode` + a short 15 ms `GainNode`) to produce tactile clicks / Geiger-counter ticks, and triggers the CSS state `pulseIntensity` on the edge of the phone screen.
* **`WakeLockManager`:**
  - Calls `await navigator.wakeLock.request('screen')` inside a `try/catch` block (so that it does not error when power-saving mode is active or on older browsers).
  - Registers a `document.addEventListener('visibilitychange', ...)` listener to automatically re-request the wake lock when the phone screen regains focus, and releases it when the session ends.

---

## 5. Application 1 Architecture: `tether-deck`

### 5.1 Desktop Host Components

* **Mode Switcher (`3D Inspector` | `Laser & Slides`):** Keeps the `TetherHost` connection alive when the presenter switches modes.
* **3D Viewport (`ThreeInspector.tsx`):**
  - Uses Three.js with two built-in `.glb` assets (e.g. Modular Cyber Server Node and Mechanical Gyro Artifact) plus a local upload input `URL.createObjectURL(file)` for the user's own `.glb` files.
  - Receives `SensorFrame`: when `primaryHeld === true`, `nx/ny/roll` rotate the object smoothly using quaternion increments; the zoom buttons on the phone shift the camera distance.
* **Slide & Laser Canvas (`SlidePresenter.tsx`):**
  - Renders the built-in HTML/Markdown presentation deck (5 interactive demo slides).
  - A fully transparent `<canvas>` layer (`pointer-events: none`) renders the laser dot with a ring buffer of the last 12 positions to create a smooth light-trail effect on `requestAnimationFrame`.
  - Every slide change sends `FeedbackEvent.syncState` (`{ slideIndex, totalSlides, speakerNotes, elapsedSec }`) to the phone.
* **Telemetry HUD:** A compact pill in the top-right corner shows the mode badge (`P2P` green / `RELAY` yellow / `EMULATOR` blue), the estimated latency, and the phone's battery/sensor indicator.

### 5.2 Mobile Controller Components (`DeckController.tsx`)

* Top: Transport status bar, **Recenter** button, and mode toggle button (`3D` / `Laser`).
* Middle: **Speaker Notes & Timer** panel (in Slides mode) or a visual orientation pad with a fallback touch-position indicator.
* Bottom: Large ergonomic **HOLD TO LASER / ORBIT** button (thumb-friendly) + **PREV** and **NEXT** buttons.

---

## 6. Application 2 Architecture: `phantom-beam`

### 6.1 Game & Lighting Engine (`CorridorEngine.ts`)

Runs on a `requestAnimationFrame` loop separate from the React re-render cycle to guarantee a stable 60 FPS:

* **Dark Scene (Three.js / WebGL):** A procedural gothic stone corridor with dense exponential fog and a single `SpotLight` that follows the `(nx, ny)` coordinates from `TetherHost` with a slight hand-inertia effect.
* **Ghost Entities & AI:**
  - `Stalker Wraith`: Emerges from behind the fog and slowly moves toward the player; gives off a blurry aura before revealing its full form when caught in the flashlight beam.
  - `Shadow Mimic`: Shifts position laterally; dodges if it is caught in the edge of the flashlight beam for too long without a UV Surge.
* **EMF Calculation & Downstream Throttling:**
  - Every frame, the engine computes the normalized distance `d` (0–1) and the angular alignment `cosTheta` between the flashlight direction and the position of the nearest entity.
  - The value `emf = clamp((1 - d) * 0.65 + max(0, cosTheta) * 0.35, 0, 1)`.
  - Sending `FeedbackEvent` from the desktop to the phone is **throttled to at most once every 66 ms (15 Hz)** and is only sent if the change `|emf - prevEmf| > 0.03` or the pulse timer is due—preventing the message queue on the DataChannel and the vibration motor from being flooded.
* **UV Surge Mechanic (Exorcism):**
  - When `cosTheta > cos(10°)` (the flashlight is locked precisely on the entity) and `primaryHeld === true` for an accumulated `2000 ms`, the flashlight color intensity shifts to a purple UV beam, the banishment progress rises to 100%, shatter particles appear, and `audioCue: 'banish'` is sent to the phone.
  - Once the lock is acquired, hysteresis holds it up to 14° so that hand tremor does not make the lock flicker. The phone sends a dedicated haptic pattern when the lock is acquired, and progress pulses at 25/50/75%.

### 6.2 Mobile Controller Components (`PhantomController.tsx`)

* UI designed in the style of **EMF Reader / Tactical Flashlight** hardware:
  - 5 EMF indicator LED segments (Green -> Yellow -> Orange -> Blinking Red) + a responsive SVG analog needle.
  - Large center button **HOLD: UV SURGE** with a circular ring progress indicator.
  - **RECENTER FLASHLIGHT** calibration panel and a synced **PLAY AGAIN** button when the 60-second session ends.

---

## 7. Backend Architecture (`signaling-relay`)

The server is designed to be as minimal as possible so that the operating cost is zero and no database is needed:

* **Technology:** Node.js 22 + `ws` (WebSocket) + `nanoid`.
* **State Storage:** `Map<roomId, RoomState>` in RAM. Each `RoomState` holds at most 2 clients (`host` and `controller`), the `sessionTokenHash`, and `expiresAt` (a 15-minute TTL that is renewed on activity).
* **Signaling Message Flow:**
  1. `register_host` -> the server returns a `roomId`.
  2. `join_room` (validates `roomId` & `sessionToken`) -> the server notifies both sides with `peer_ready`.
  3. `signal_offer` / `signal_answer` / `signal_ice` -> forwarded directly to the counterpart in the same room.
  4. `relay_frame` (only active when `WS_RELAY` mode is used) -> forwards lightweight JSON/binary between the two peers in the same room, with a maximum payload size limit of `4 KB` per message.
* **Security:** A limit of at most 200 concurrently active rooms on the free instance and a per-IP rate limiter (at most 30 connections/minute) to prevent abuse of the public URL during judging.

---

## 8. Kiro Configuration Blueprint (`/.kiro`)

Below is the design of the actual files that must be created and maintained in the `/.kiro/` folder during development so that they are verifiable in the public repository.

### 8.1 `.kiro/steering/sensor-browser-safety.md`

```markdown
---
inclusion: fileMatch
fileMatchPattern: ["tetherkit-core/src/sensors/**", "tetherkit-core/src/feedback/**"]
---
# Browser Sensor & Haptics Compatibility Guidelines

1. All access to `DeviceOrientationEvent.requestPermission()` MUST be called directly and synchronously inside the user's click event handler (user gesture), not inside `useEffect` or `setTimeout`.
2. Always provide a `TouchTrackpadAdapter` fallback if permission is denied, the sensor is not available, or the page is opened in `WKWebView` / an in-app browser.
3. `navigator.vibrate()` is not supported in iOS Safari and Firefox 129+. Always call it through `FeedbackDispatcher`, which limits the array to at most 10 elements, checks the function defensively, and automatically triggers Web Audio + a visual pulse as a universal replacement.
4. `navigator.wakeLock` must be wrapped in try/catch and re-registered on the `visibilitychange` event when `document.visibilityState === 'visible'`.
```

### 8.2 `.kiro/hooks/run-core-pbt-on-edit.json`

Uses a `command` action (Shell Command) to automatically validate the math & protocol properties every time the agent edits core files, without using up Kiro credit quota:

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Run TetherKit Core Property-Based Tests",
      "description": "Runs the fast-check property tests every time the agent changes the protocol or the sensor math",
      "trigger": "FileSave",
      "matcher": "^tetherkit-core/src/(protocol|sensors)/.*\\.ts$",
      "action": {
        "type": "command",
        "command": "pnpm --filter tetherkit-core test:pbt"
      },
      "timeout": 45,
      "enabled": true
    }
  ]
}
```

### 8.3 `.kiro/hooks/sync-protocol-on-spec-save.json`

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Verify Spec & Protocol Alignment",
      "description": "Reminds the agent to verify TypeScript type alignment when the protocol spec is updated",
      "trigger": "FileSave",
      "matcher": "^\\.kiro/specs/tether-protocol/(requirements|design)\\.md$",
      "action": {
        "type": "agent",
        "prompt": "The tether-protocol spec was just updated. Check the differences against tetherkit-core/src/protocol/types.ts, update the type schema if needed, and make sure the unit tests and PBT still pass."
      },
      "enabled": true
    }
  ]
}
```

### 8.4 Property-Based Testing Specification (`fast-check`)

The following invariant properties are tested automatically with hundreds of random inputs (including the extreme values `NaN`, `-0`, `359.999 deg`, and random packet ordering) in `tetherkit-core/tests/`:

| Property Name | Invariant Tested via `fast-check` |
| --- | --- |
| **Angle Wrapping Bounds** | For any angles `a, b` in `[0, 360)`, `wrapDeltaDegrees(a, b)` always produces a value in the range `[-180, 180)` and `wrapDeltaDegrees(a, a) === 0`. |
| **Calibration Identity** | After calling `calibrate(rawYaw, rawPitch)` with random input angles, the next reading with exactly the same angles produces `nx === 0` and `ny === 0`. |
| **Normalized Output Clamp** | For any random gyroscope input or touch drag, the output values `nx`, `ny`, `roll` never produce `NaN`/`Infinity` and are always within `[-1.0, 1.0]`. |
| **Monotonic Sequence Guard** | For any permutation of the order of integer `seq` values entering `FrameOrderGuard`, the `lastAcceptedSeq` value is monotonically increasing and stale packets are always rejected. |
| **Vibration Sanitizer** | For any random integer array (negative, very long, or values > 10000), `sanitizeVibrationPattern()` always returns a length <= 10 and a total duration <= 10,000 ms. |

---

## 9. Deployment, Local HTTPS, & Production Security

| Environment | Hosting & TLS Configuration | Purpose |
| --- | --- | --- |
| **Local Dev (Laptop + Real Phone)** | `@vitejs/plugin-basic-ssl` or `cloudflared tunnel --url https://localhost:5173` | **Required:** iOS Safari and Chrome Android block the `DeviceOrientation` and `WakeLock` APIs on the LAN address `http://192.168.x.x`. |
| **Frontend Production** | **Vercel** or **Cloudflare Pages** (2 separate projects or 2 subdomains for `tether-deck` and `phantom-beam`, automatic HTTPS) | Ensures that the Devpost Working App URL is fast, free, and has a valid TLS certificate. |
| **Signaling Relay Production** | **Fly.io** / **Railway** / **Render** (`wss://relay.tetherkit...`) | Supports persistent WebSocket connections with automatic TLS termination. |

### Pre-Submission Testing Checklist

1. **Cross-Network Test:** Test the Host on home/office Wi-Fi and the Phone on a 4G/5G cellular network to verify the `P2P` (STUN) transition as well as the automatic fallback to `WS_RELAY` if NAT blocks it.
2. **Device Matrix Test:** Test on at least 1 Android Chrome (verify vibration + gyroscope + Wake Lock), 1 iPhone Safari (verify the `requestPermission` dialog + the audio/visual replacement + Wake Lock), and 1 in-app browser (verify the WKWebView message + Touch Trackpad).
3. **Single-Screen Judge Experience Test:** Open the public URL in Incognito mode on a single desktop only, click **"Try Virtual Phone (Split-View)"**, and complete one presentation run in `tether-deck` and one ghost-banishing run in `phantom-beam` in under 90 seconds.

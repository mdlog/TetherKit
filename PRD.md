# Product Requirements Document (PRD): TetherKit

> Translated from the original Indonesian. The original wording is in the git history.

| Document Attribute | Detail |
| --- | --- |
| Product Name | **TetherKit** (Core SDK + `tether-deck` + `phantom-beam`) |
| Document Version | 1.0.0 (Hackathon MVP Specification) |
| Target Competition | **Kiroween 2026** — Main Category: **Skeleton Crew** |
| Potential Target Bonuses | Best Demo, Bonus Blog Prize, Social Blitz Prize (optional: Best Student / Best Startup) |
| Submission Deadline | Friday, 4 December 2026 at 14:00 PST (Saturday, 5 December 2026 at 05:00 WIB / 06:00 WITA) |
| Project License | MIT Open Source License |

---

## 1. Executive Summary & Product Vision

**TetherKit** is an open-source, zero-install framework (skeleton code template) that turns any smartphone into a spatial motion controller, a wireless touchpad, and a low-latency physical feedback unit for desktop web applications—simply by scanning a QR code in the browser.

Unlike webcam-based gesture tracking solutions that require good lighting, a fixed camera angle, and downloading heavy computer vision dependencies, TetherKit uses **WebRTC DataChannel** and **built-in mobile browser sensors** (gyroscope, multi-touch, procedural audio, and haptic vibration) to build a high-speed two-way link directly in modern browsers.

To prove the flexibility of the core framework `tetherkit-core`, this repository includes **two strongly contrasting applications** built on the same foundation:
1. **`tether-deck` (Productivity & Presentation App):** Turns the phone into a gyroscopic laser pointer, a 3D model rotation controller, and a presentation remote, complete with speaker notes and a live timer on the phone screen.
2. **`phantom-beam` (Kiroween-Themed Asymmetric Horror Game App):** Turns the desktop screen into a dark haunted corridor, while the phone in the player's hand acts as a physical flashlight and an EMF (Electromagnetic Field) detector that emits audio/visual pulses and haptic vibrations that get faster as it nears invisible entities.

---

## 2. Problem Background & Opportunity

| Main Problem | Impact on Developers & Users | TetherKit Solution |
| --- | --- | --- |
| Interactive desktop apps & 3D demos are tied to the mouse/trackpad | Product presentations, 3D object inspection, and web games feel flat and less immersive | Turns the phone everyone already owns into a wireless 3-DOF/touch controller |
| Webcam-based controllers (Computer Vision) are fragile | They fail in dark rooms, drain the CPU, and raise camera privacy concerns | Uses the phone's local orientation/touch sensors without turning on the camera or sending video |
| Building a multi-device project from scratch takes a long time | Developers have to rewrite the code for QR pairing, WebRTC ICE, relay fallback, calibration, and Wake Lock | Provides a ready-to-use skeleton framework (`tetherkit-core`) with schema contracts validated by Kiro Specs |
| Hackathon judges often test apps from only 1 laptop | Two-device apps often cannot be judged to their full extent if judges are reluctant to pick up a phone | Provides a built-in **Virtual Phone Split-View Emulator** so that 100% of features can still be tested on one screen |

---

## 3. Judging Criteria Fit & Rule Compliance

### 3.1 Mapping to the 5 Kiroween 2026 Judging Criteria

1. **Potential Impact:** Gives web developers a real template for building party games, interactive presentation tools, or exhibition installation controllers without requiring a store app (App Store/Play Store).
2. **Technological Implementation:** Uses **Kiro Spec-Driven Development** (`.kiro/specs/`), **Agent Hooks** (`.kiro/hooks/`), **Steering Docs** (`.kiro/steering/`), and **Property-Based Testing** (`fast-check`) to guarantee the reliability of the binary/JSON synchronization protocol between phone and desktop.
3. **Design:** A clean Spatial Utility-style interface in `tether-deck` and a Gothic Phosphor / EMF Radar atmosphere in `phantom-beam`, complete with one-tap calibration and a real-time latency HUD.
4. **Innovation / Idea:** Provides two directions of physical communication—phone motion controls the desktop canvas (upstream), and the desktop's spatial state triggers EMF/vibration/audio signals to the phone (downstream)—through a zero-install architecture with a built-in emulator mode.
5. **Presentation:** A demo video under 3 minutes that right away shows picture-in-picture of a hand holding a real phone moving a 3D model at second 5, switching to the haunted flashlight at second 20, then dissecting the Kiro automation.

### 3.2 Skeleton Crew Category Rule Compliance Checklist

- [ ] A **public GitHub** repository (not GitLab/BitBucket) newly created between 30 October – 4 December 2026.
- [ ] The `LICENSE` file (MIT) is at the root and detected in the GitHub About section.
- [ ] The `/.kiro` folder is intact at the project root and is **not** listed in `.gitignore`.
- [ ] There are **two clearly separate application folders** in the repository (`tether-deck/` and `phantom-beam/`), separate from the core library (`tetherkit-core/`).
- [ ] A public **HTTPS**-based **Working App URL** (required for device sensor APIs) is available that judges can run directly.
- [ ] The demo video is uploaded publicly to YouTube with a duration of **less than 3 minutes**, free of third-party copyrighted music or brands.
- [ ] The `THIRD_PARTY_NOTICES.md` file lists all open-source libraries and assets used.

---

## 4. User Personas & Main Scenarios

1. **Raka (Technical Speaker / 3D Designer — `tether-deck` User):**
   Wants to rotate a 3D architectural model and aim a laser pointer while presenting from a distance without buying an expensive physical clicker, while also seeing the remaining time and notes in the palm of the hand.
2. **Dina (Casual Player — `phantom-beam` User):**
   Wants to play a short 60-second horror game on a laptop with friends just by scanning a QR code, feeling the sensation of swinging the phone like a real flashlight in a dark room with thrilling sound and vibration effects.
3. **Budi (Web Developer — `tetherkit-core` User):**
   Wants to copy (fork) a clean template that is easy to understand within 10 minutes to build a custom phone controller app of their own using Kiro IDE.
4. **Hackathon Judging Panel (Quick Testers < 90 Seconds):**
   May test using a personal phone by scanning the QR code, OR test quickly in a single laptop browser using the **"Launch Split-View Emulator"** button without needing to touch a phone.

---

## 5. Scope Boundaries

### 5.1 In MVP Scope (Must Be Finished Before 4 December 2026)

* **Core SDK (`tetherkit-core`):** QR code pairing + manual 6-character room code, WebRTC DataChannel connection (unordered sensor channel + reliable control channel), automatic fallback to WebSocket Relay after a 4-second timeout, center calibration (recenter), orientation smoothing filter, Touch Trackpad fallback mode (for devices without a gyroscope/WKWebView), `Screen Wake Lock` management, `FeedbackDispatcher` (Android Vibration API + Web Audio + iOS/desktop visual pulse), and the `VirtualPhoneEmulator` component.
* **App 1 (`tether-deck`):** 3D Spatial Inspector mode (Three.js with 2 built-in interactive models + rotation/zoom controls), Laser & Slide Deck mode (5 built-in interactive slides themed on TetherKit/Kiroween + a smooth laser trail), speaker notes & timer view on the phone, and a latency/FPS metrics HUD.
* **App 2 (`phantom-beam`):** A dark 3D/2.5D corridor with a real-time flashlight cone beam, 2 types of ghost entities (Stalker Wraith & Shadow Mimic) with patrol/approach AI, a distance-angle calculation system to send EMF intensity 0.0–1.0 to the phone, a UV Overload shooting mechanic to banish entities, win/lose conditions in a 60-second session, and volume/audio controls.

### 5.2 Out of MVP Scope (Deferred Until After the Hackathon)

* Simultaneous multiplayer support (> 1 phone connected to 1 desktop screen in one session).
* Uploading PPTX/PDF files or custom `.glb` files to permanent cloud storage (the MVP only needs to support local upload into browser memory for `.glb`/Markdown and ready-to-use built-in content).
* User login account/database integration (sessions are temporary/ephemeral for speed and privacy).

---

## 6. Functional Requirements (EARS Format for Kiro Specs)

### 6.1 Core Framework (`tetherkit-core`)

| ID | Functional Requirement (EARS Notation) | Priority |
| --- | --- | --- |
| FR-CORE-01 | **WHEN** the desktop Host opens a new session, **THE SYSTEM SHALL** generate a random `roomId` of at least 6 characters along with a temporary `sessionToken`, open a connection to the signaling server, and display a QR code and a copyable short link. | P0 (Required) |
| FR-CORE-02 | **WHEN** the user scans the QR code from the phone or types in the room code, **THE SYSTEM SHALL** perform WebRTC SDP/ICE negotiation and establish two DataChannels: the `sensor` channel (`ordered: false, maxRetransmits: 0`) and the `control` channel (`ordered: true`). | P0 (Required) |
| FR-CORE-03 | **IF** the WebRTC P2P connection fails to connect within 4,000 ms (for example due to symmetric NAT/firewall), **THEN THE SYSTEM SHALL** automatically switch to `WS_RELAY` mode via the WebSocket server without interrupting the user flow and update the transport status indicator. | P0 (Required) |
| FR-CORE-04 | **WHEN** the mobile controller runs on iOS Safari 13+ and the user presses the **"Connect & Enable Sensors"** button, **THE SYSTEM SHALL** call `DeviceOrientationEvent.requestPermission()` directly inside that user click handler. | P0 (Required) |
| FR-CORE-05 | **IF** the sensor permission API is denied by the user or unavailable (such as in in-app `WKWebView` browsers or on desktop), **THEN THE SYSTEM SHALL** seamlessly enable **Touch Trackpad Fallback** mode and display a message suggesting opening the system browser (Safari/Chrome) if it detects that it is running in `WKWebView`. | P0 (Required) |
| FR-CORE-06 | **WHEN** the user presses the **"Recenter / Zero"** button on the phone, **THE SYSTEM SHALL** store the current orientation as the relative zero reference point (`offsetYaw`, `offsetPitch`, `offsetRoll`) so that all subsequent motion is calculated relative to the user's comfortable position. | P0 (Required) |
| FR-CORE-07 | **WHEN** the mobile controller is active and visible, **THE SYSTEM SHALL** request `navigator.wakeLock.request("screen")` (if supported by the browser) and automatically re-request the screen lock every time the `visibilitychange` event returns to `visible`. | P1 (High) |
| FR-CORE-08 | **WHEN** the desktop Host sends a `FeedbackEvent` message (`intensity`, `pattern`), **THE SYSTEM SHALL** trigger `navigator.vibrate()` (limited to a maximum of 10 elements and a total of < 10,000 ms) on devices that support it, and play a Web Audio API pulse and a screen-edge glow as a universal haptic substitute on iOS. | P0 (Required) |
| FR-CORE-09 | **WHEN** a tester on desktop clicks the **"Try Virtual Phone (Split-View)"** button, **THE SYSTEM SHALL** open a side panel containing the real mobile controller interface, connected to the Host via a local `BroadcastChannel` using the identical `TetherProtocol` schema. | P0 (Required) |

### 6.2 Application 1 — `tether-deck`

| ID | Functional Requirement (EARS Notation) | Priority |
| --- | --- | --- |
| FR-DECK-01 | **WHEN** `tether-deck` is in **Laser & Slides** mode and the phone is tilted, **THE SYSTEM SHALL** map changes in yaw and pitch to normalized `(x, y)` coordinates in the range `[-1, 1]` and render a glowing laser dot with a trail effect on a canvas above the active slide. | P0 (Required) |
| FR-DECK-02 | **WHEN** the user presses the Next / Previous button or swipes the phone screen horizontally in presentation mode, **THE SYSTEM SHALL** move the active slide on the desktop and synchronize the slide number, speaker notes, and remaining presentation time to the phone screen. | P0 (Required) |
| FR-DECK-03 | **WHEN** `tether-deck` is in **3D Inspector** mode and the Grab / Orbit button on the phone is held while rotating the wrist, **THE SYSTEM SHALL** smoothly rotate the Three.js 3D object on the corresponding axis and support a two-finger swipe or zoom buttons to zoom the camera in/out. | P0 (Required) |
| FR-DECK-04 | **WHEN** the user selects a local `.glb` file or one of the 2 built-in models on the desktop, **THE SYSTEM SHALL** load the object into the 3D scene without sending the file to an external server, and it can be controlled from the phone right away. | P1 (High) |

### 6.3 Application 2 — `phantom-beam`

| ID | Functional Requirement (EARS Notation) | Priority |
| --- | --- | --- |
| FR-PHAN-01 | **WHEN** a `phantom-beam` game session starts, **THE SYSTEM SHALL** render a dark corridor space on the desktop with a flashlight light cone that follows the `(x, y)` position from the phone sensor in real time. | P0 (Required) |
| FR-PHAN-02 | **WHILE** a ghost entity is inside or near the game corridor, **THE SYSTEM SHALL** compute a proximity score from the flashlight beam angle and the entity's distance into an EMF value (`0.0` to `1.0`) and send it to the phone at most 15 times per second (throttled). | P0 (Required) |
| FR-PHAN-03 | **WHEN** the phone receives an EMF value > `0.15`, **THE SYSTEM SHALL** move the EMF Meter needle/LED bar on the phone screen, speed up the Geiger-counter ticking sound, and trigger haptic/audio pulses at an interval that shortens as the EMF value rises. | P0 (Required) |
| FR-PHAN-04 | **WHEN** the flashlight beam is squarely on a revealed entity and the player holds the **"UV Surge"** button on the phone for 2.0 seconds, **THE SYSTEM SHALL** raise the banishment meter to 100%, trigger a particle dissolve effect, and add to the player's score. | P0 (Required) |
| FR-PHAN-05 | **WHEN** all target entities have been banished before the 60 seconds run out, **THE SYSTEM SHALL** display the victory screen ("AREA PURIFIED"); **IF** sanity integrity (Sanity) reaches 0 because an entity touches the player for too long or time runs out, **THE SYSTEM SHALL** display the defeat screen along with a **"Play Again"** button that is synchronized between desktop and phone. | P0 (Required) |

---

## 7. Non-Functional Requirements (NFR)

| Category | Measurable Specification Target |
| --- | --- |
| **End-to-End Latency** | <= 35 ms on a local Wi-Fi network (WebRTC P2P); <= 110 ms in `WS_RELAY` fallback mode. |
| **Sampling & Render Rate** | Sensor transmission is capped at a stable 60 Hz; desktop canvas & 3D rendering is kept at >= 60 FPS on a standard laptop. |
| **Browser Compatibility** | **Desktop Host:** Chrome 110+, Edge 110+, Firefox 115+, Safari 16.4+. **Phone:** Android Chrome 110+, iOS Safari 17+ (full Wake Lock on iOS 18.4+, with safe degradation on versions below that). |
| **Security & Privacy** | Must run over **HTTPS/WSS**; sensor data is not stored on the server; `roomId` automatically expires after 15 minutes of inactivity; signaling message rate limit of at most 30 requests/minute per IP. |
| **Packet Resilience** | Sensor packets whose sequence number (`seq`) is lower than the last received packet must be discarded immediately so that backward jumps (jitter spikes) do not occur. |
| **Bundle Size** | Core package `tetherkit-core` compressed < 25 KB (excluding 3D assets), easy to read as a Skeleton Crew template. |

---

## 8. Demo Video Storyboard (< 3 Minutes — Target 2 Minutes 45 Seconds)

The video is recorded in 1080p 60fps with camera footage of a hand holding a real phone (Picture-in-Picture) so that the physical magic is immediately visible as real.

| Time Range | Section | On-Screen Visuals & Real Actions | Narration Message Points |
| --- | --- | --- | --- |
| **0:00 – 0:15** | **Instant Hook** | The desktop screen shows the `tether-deck` 3D model. PiP of a hand holding a phone scanning the QR -> at second 5 the wrist rotates the 3D model instantly without touching the mouse! | "No webcam or app installation needed. Scan the QR, and your phone instantly becomes a 60Hz spatial controller for the desktop." |
| **0:15 – 0:50** | **Demo App 1: `tether-deck`** | Switch to Laser & Slides mode: hand movement highlights slide points with the laser trail, pressing a button on the phone changes slides while showing the speaker notes & timer on the phone screen. | Shows real practical value (Potential Impact) for presenters, 3D designers, and developers. |
| **0:50 – 1:35** | **Demo App 2: `phantom-beam`** | Switch to the second app (`phantom-beam`). Room lights/screen dim. Phone movement sweeps the dark corridor; when nearing a ghost, the EMF meter on the phone glows red, the Geiger sound ticks rapidly, then the UV Surge button destroys the ghost. | "One and the same code framework gives rise to two contrasting apps—proving the flexibility of the Skeleton Crew architecture." |
| **1:35 – 2:20** | **Kiro Engineering Breakdown** | Show the GitHub folder structure (`.kiro/` + `tether-deck/` + `phantom-beam/`). Open Kiro IDE: change 1 new action in `.kiro/specs/tether-protocol/requirements.md`, save -> show the **Agent Hook** triggering a TypeScript type update & running the **Property-Based Tests** (`fast-check`) automatically. | Shows off the depth of Kiro usage (EARS Specs, Steering, Agent Hooks, and PBT) for the Technological Implementation score. |
| **2:20 – 2:45** | **Fallback & Closing** | Click the **"Try Virtual Phone (Split-View)"** button on a single laptop screen to show how easily judges can test without a phone, then show the end screen with the repo URL & public demo. | "TetherKit: Lean core, two real apps, ready to be tested on a phone or on a single screen." |

---

## 9. 15-Day Execution Roadmap (19 November – 4 December 2026)

| Date | Phase | Key Deliverables |
| --- | --- | --- |
| **19–20 Nov** | **Kiro Initiation & Foundation** | Register on Devpost, apply for 4,000 Kiro credits (well before the 1 Dec deadline), create a public GitHub repo + MIT license + `/.kiro/` (`steering` & `specs`), run local HTTPS dev. |
| **21–24 Nov** | **`tetherkit-core` Core & Signaling** | Implement the WebSocket signaling + relay server, WebRTC dual-channel, gyroscope calibration, iOS permission flow, Touch Trackpad fallback, `FeedbackDispatcher`, and `VirtualPhoneEmulator`. |
| **25–27 Nov** | **Application 1 (`tether-deck`)** | Build the presenter interface & Three.js 3D Inspector, slide engine, laser canvas, and timer/notes synchronization. |
| **28–30 Nov** | **Application 2 (`phantom-beam`)** | Build the atmospheric corridor, flashlight raycast/shader, AI for 2 entities, EMF feedback loop to the phone, procedural audio, and the 60-second win/lose screens. |
| **1 Dec** | **Testing & PBT + Credits** | Write and pass the Property-Based Testing suite (`fast-check`), test physically on Android + iOS Safari + desktop, make sure the Kiro credits have been processed (form deadline 1 Dec 12:00 PST). |
| **2 Dec** | **Deployment & Bonus Content** | Deploy production HTTPS (Frontend + WSS Relay), test the public URL in Incognito, record & upload the YouTube video < 3 minutes, publish the blog & the `#KiroweenHackathon26` post. |
| **3–4 Dec** | **Final Audit & Submit** | Verify `/.kiro/` is not ignored, check the third-party library list, finish filling in the Devpost form at least 12 hours before **4 Dec 14:00 PST (5 Dec 05:00 WIB / 06:00 WITA)**. |

---

## 10. Risk Matrix & Mitigation Strategies

| Technical / Non-Technical Risk | Impact | Mitigation Strategy |
| --- | --- | --- |
| **iOS Safari blocks sensors without HTTPS or without a direct click** | Orientation sensor values are `null` | HTTPS required in dev & prod; bind `requestPermission()` to an explicit button; automatically switch to Touch Trackpad mode if denied. |
| **QR link opened in a camera/WhatsApp WebView (`WKWebView`)** | `requestPermission` is not available | Detect common WebView User-Agent patterns; show an "Open in Safari/Chrome" guidance banner + immediately enable Touch Trackpad. |
| **iOS does not support `navigator.vibrate()`** | No vibration effect on iPhone | `FeedbackDispatcher` automatically replaces/supplements it with Web Audio API ticks + synchronized screen-edge flashes. |
| **Campus/office NAT/Firewall blocks the WebRTC P2P connection** | Status stuck at Connecting | A 4-second WebRTC timeout automatically falls back to the `WS_RELAY` backup channel on the same signaling server. |
| **Judges do not use a phone when judging** | They only see the QR screen | The **"Open Split-View Emulator"** button embeds the real phone component next to the desktop canvas via `BroadcastChannel`. |
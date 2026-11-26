# Devpost submission text

Copy each block into the matching Devpost field. Fill in the URLs once the apps are deployed.

## Project name

TetherKit

## Elevator pitch (max 200 characters)

Turn any phone into a motion controller, touchpad and haptic unit for a desktop web app. Scan a QR code: no install, no camera. One lean skeleton, two very different apps.

## Category

Skeleton Crew

## Links

- Repository: https://github.com/mdlog/TetherKit
- tether-deck (app 1): `https://<tether-deck-url>`
- phantom-beam (app 2): `https://<phantom-beam-url>`
- Demo video: `https://youtu.be/<id>`

## Built with

typescript, react, vite, three.js, webrtc, websockets, node.js, fast-check, vitest, kiro, fly.io, vercel

---

## About the project (paste from here)

### Inspiration

Interactive web demos, 3D viewers and browser games are still stuck with a mouse. The usual way out, webcam gesture tracking, fails in a dark room, burns CPU, and asks people to switch on a camera. Meanwhile everyone already holds a gyroscope, a touchscreen, a speaker and a vibration motor in their pocket.

Wiring a phone to a desktop page by hand is a lot of plumbing: QR pairing, WebRTC and ICE, a relay for when peer-to-peer fails, sensor calibration, iOS permission rules, and wake locks. TetherKit is that plumbing packaged as a small skeleton, so a new phone-controlled app starts from working code instead of a blank page.

### What it does

You scan a QR code and the phone becomes a 60 Hz controller for the desktop page. Nothing is installed and the camera is never used. To show the skeleton is flexible, two apps with opposite moods are built on it:

- **tether-deck** (productivity): a gyroscopic laser pointer, a presenter remote that shows speaker notes and a timer on the phone, and a wrist-controlled orbit tool for 3D models. You can load your own Markdown slides or `.glb` model, and they are parsed in the browser without being uploaded.
- **phantom-beam** (Kiroween horror): a 60-second haunted-corridor game. The phone is your flashlight and EMF meter. As a ghost gets closer, the meter clicks and buzzes faster and whispers come from the ghost's side. Lock onto it and hold UV Surge, and in a dark room the phone screen blazes purple and lights up the room. Jump scares can be turned off.

**No phone handy?** Both apps have **Try Virtual Phone (Split-View)**. The real controller page opens beside the desktop view and links over `BroadcastChannel` with the same protocol, so every feature can be tested on one laptop.

### How I built it

- **tetherkit-core** is the skeleton: pairing, transports, the sensor pipeline, feedback, and a small React UI kit. It is 12.6 KB gzipped against a 25 KB budget.
- **Two DataChannels.** `tether-sensor` is unordered with no retransmits, so a lost frame never delays a newer one. `tether-control` is reliable and carries actions, haptics and state sync.
- **Fallbacks at every layer.** If WebRTC doesn't connect within 4 s, traffic goes through a WebSocket relay. If gyro permission is denied, or the page runs in an in-app browser, a touch trackpad takes over. On phones without the Vibration API (iOS), a Web Audio click and an edge glow stand in for it.
- **Sensor math.** Pointing comes from the device's direction vector instead of raw Euler angles, so steep tilts don't flip. Deltas are wrapped to ±180° and smoothed by a One Euro filter: steady when the hand is still, nearly lag-free on a fast turn.
- **signaling-relay** is a small Node WebSocket server with in-memory rooms, hashed one-time tokens, per-IP rate limits and a 4 KB frame cap.
- All 3D models, textures, ghost sprites and sounds are generated in code. The repo contains no image, model, font or audio files.

I built it in the Kiro IDE, starting from an EARS-style PRD and architecture doc. Kiro specs, steering, hooks and property-based tests kept it honest as it changed. The details are in the "How I used Kiro" section.

### Challenges I ran into

- **iOS permissions.** Motion sensors, audio and the wake lock must all be requested inside the same tap. That forced a single `connectFromGesture()` entry point.
- **Euler angles flip** when the phone tilts steeply, so pointing had to be rebuilt on direction vectors.
- **P2P is not guaranteed.** Some networks block it, so the relay fallback had to be automatic and fast. In a local test, a forced ICE failure fell back to the relay in about 4.9 s.
- **A test that proved nothing.** The first game-rule property passed 150 runs, but none of those runs ever banished a ghost. The generators had to be redesigned, and the property now asserts its own coverage.
- **Making the horror game fair.** A headless simulation across 5 seeds and 4 player strategies tuned walking speed, ghost speed and fog so that good aim wins and idling loses.

### Accomplishments that I'm proud of

- A 12.6 KB (gzipped) core that carries two very different apps.
- Every feature can be tested on a single laptop through the Virtual Phone, which matters because judges may not pick up a phone.
- 15 fast-check properties (33 tests) over the protocol, sensor math, feedback and game rules. The decoder is fuzzed with 2,000 runs per property and never throws.
- Feedback goes both ways: the phone steers the desktop, and the desktop pushes EMF readings, haptics, audio and even a screen flash back into your hand.

### What I learned

- A property-based test can pass for the wrong reason. Each property now checks that its interesting case actually happened.
- Scoping steering with `fileMatch` keeps strict rules precise. The sensor rules only load when sensor code is open.
- Specs earn their keep after the first build: they stopped the code from drifting while I changed things based on real-phone testing.

### What's next for TetherKit

- Several phones in one room, for party games and multiplayer.
- Upload and keep your own slide decks and 3D models, instead of only loading them locally in the browser.

---

## How I used Kiro

Paste the contents of [KIRO_WRITEUP.md](KIRO_WRITEUP.md) here, or into a separate field if the form has one.

# Product: TetherKit

TetherKit is an open-source (MIT), zero-install skeleton that turns any phone into a motion controller, touchpad and haptic unit for a desktop web app. The phone scans a QR code, opens a web page, and streams orientation over a WebRTC DataChannel. Nothing is installed and the camera is never used.

## What ships in this repo
- `tetherkit-core`: the lean SDK. It covers pairing, transports, the sensor pipeline, feedback and a small React UI kit. It must stay app-agnostic and under 25 KB gzipped.
- `tether-deck` (app 1): presenter remote, gyroscopic laser pointer and Three.js 3D inspector.
- `phantom-beam` (app 2): a 60-second asymmetric horror game. The desktop shows a dark corridor, and the phone is the flashlight and EMF meter.
- `signaling-relay`: a WebSocket signaling server with relay fallback. Rooms live in memory and nothing goes to a database.

## Context: Kiroween 2026, Skeleton Crew category
- Judges must be able to evaluate everything in under 90 seconds, often with only a laptop. Every app must work in the **Split-View Virtual Phone** (BroadcastChannel) with no real phone at all.
- The two apps must feel very different, which shows the skeleton is flexible. Productivity goes to the deck and spooky goes to the game.
- Keep `/.kiro` at the repository root and never add it to `.gitignore`.
- Ship no third-party trademarks, copyrighted music or unlicensed assets. Models, textures and audio are procedural.

## Product principles
1. **Works first try.** Fall back gracefully. If WebRTC fails, use the relay. If gyro is denied, use the touch trackpad. If there is no vibration motor, use an audio pulse plus edge glow.
2. **Physical feedback both ways.** The phone moves the desktop (upstream), and the desktop drives phone haptics and audio (downstream).
3. **Privacy by default.** Only orientation and button states leave the phone. Sessions are ephemeral (15-minute room TTL) and there are no accounts.
4. **Explain the link.** Always show the transport (P2P / RELAY / EMULATOR), latency and sensor rate.

## Personas
- Raka, a technical speaker: laser plus slides plus notes and a timer on the phone.
- Dina, a casual player: scans the QR code and plays a 60-second scare with friends.
- Budi, a web developer: forks `tetherkit-core` and builds a custom controller in about 10 minutes.
- Judges: test in under 90 seconds on one screen.

# Repository structure

```
.kiro/                 specs, steering and hooks (tracked; required by Kiroween rules)
tetherkit-core/        the skeleton SDK
  src/protocol/        TetherProtocol v1 types, codec, seq guard
  src/transport/       signaling client, WebRTC session, BroadcastChannel link, signal-types (shared with relay)
  src/sensors/         orientation math, pipeline, touch trackpad, environment detection
  src/feedback/        vibration sanitizer, Web Audio synth, dispatcher, wake lock, throttle
  src/react/           hooks + UI kit (PairingCard, VirtualPhoneEmulator, TelemetryHud, ConnectScreen, TouchPad, HoldButton, EdgeGlow, PoseDot)
  src/host.ts          TetherHost (desktop)
  src/controller.ts    TetherController (phone)
  tests/               fast-check property tests
signaling-relay/       WebSocket signaling + relay server (room-manager, rate-limiter, server)
tether-deck/           APP 1: presenter & 3D inspector
  src/host/            desktop UI (HostApp, ThreeInspector, SlidePresenter, LaserOverlay)
  src/controller/      phone UI (ControllerApp, DeckController)
  src/shared/          deck-protocol.ts (actions + syncState)
  src/assets/          built-in deck (Markdown) and procedural models
phantom-beam/          APP 2: horror flashlight game
  src/host/            CorridorEngine (Three.js), game/ (pure rules), textures
  src/controller/      phone EMF reader UI
  src/audio/           procedural ambient synth (desktop) + Geiger counter (phone)
  src/shared/          phantom-protocol.ts
docs/                  deployment, demo script and submission write-ups
```

## Where things go
- A new **message type** goes in `tetherkit-core/src/protocol/types.ts` and `codec.ts`, followed by a spec update and a PBT property.
- A new **app action** goes in the app's `src/shared/*-protocol.ts`. Handle it in the app's `HostApp` and send it from its controller.
- A new **app**: copy one of the app folders. Each app is a single Vite build with two roles, `/` = desktop host and `/control` = phone. Lazy-load the role so the phone never downloads Three.js.
- **Server-side** changes belong in `signaling-relay/src`. Wire types live in `tetherkit-core/src/transport/signal-types.ts` (DOM-free, imported by both sides).

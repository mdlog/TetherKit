# TetherKit

**Turn any phone into a motion controller, touchpad and haptic unit for your desktop web app. Scan a QR code and go: no install, no camera, no app store.**

TetherKit is a lean, MIT-licensed skeleton (`tetherkit-core`) plus two very different apps built on it. It is my entry for the **Kiroween 2026, Skeleton Crew** category.

| | App | What your phone becomes |
| --- | --- | --- |
| 🎤 | **[tether-deck](tether-deck/)** | A gyroscopic laser pointer, a presenter remote with notes and timer, and a wrist-controlled orbit tool for 3D models |
| 👻 | **[phantom-beam](phantom-beam/)** | The flashlight and EMF meter in a 60-second haunted-corridor game. You walk deeper on your own while the meter clicks and buzzes faster and whispers come from the ghost's side. In a dark room, the phone screen itself blazes UV purple when you banish a ghost. Jump scares can be turned off |

> **No phone handy?** Click **"Try Virtual Phone (Split-View)"** in either app. The real controller page opens beside the desktop view in an iframe, linked over `BroadcastChannel` with the same protocol. Every feature can be tested on one laptop.

**Live demo:** `https://<tether-deck-url>` · `https://<phantom-beam-url>` *(fill in after deploying, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))*
**Video:** `https://youtu.be/<id>`

---

## How it works

```
 Phone (/control)                                  Desktop (/)
 ┌──────────────────────────┐   WebRTC P2P      ┌──────────────────────────┐
 │ TetherController         │ ─ tether-sensor ▶ │ TetherHost               │
 │  gyro → pointing vector  │   unordered 60 Hz │  seq guard → latest frame│
 │  recenter · EMA · touch  │ ◀ tether-control ▶│  actions · feedback/sync │
 │  vibrate · audio · glow  │   ordered         │  QR · HUD · emulator     │
 └────────────┬─────────────┘                   └────────────┬─────────────┘
              │      WSS signaling (+ relay if P2P fails in 4 s)     │
              └──────────────►  signaling-relay  ◄────────────────────┘
```

- **Pairing:** the QR code carries a 6-character room code and a one-time token. You can also type the code by hand.
- **Two DataChannels:** `tether-sensor` is unordered with no retransmits, so a lost frame never delays newer ones. `tether-control` is reliable and carries actions, haptics and state sync.
- **Fallbacks at every layer:**
  - If WebRTC doesn't connect within 4 s, traffic goes through the WebSocket relay.
  - If the gyro permission is denied, or the page runs in an in-app browser, the touch trackpad takes over.
  - If the phone has no vibration API (iOS), a Web Audio click and an edge glow stand in for it.
- **Sensor math:** pointing is computed from the device's direction vector, not raw Euler angles, so steep tilts don't flip. Deltas are wrapped to ±180°, then smoothed by an adaptive One Euro filter: steady when your hand is still, nearly lag-free when you turn fast. **Recenter** stores your comfortable pose as zero, and in 3D mode every ORBIT grab re-zeroes automatically.
- **Measured locally** (Chrome, same machine): one-way latency of about 1–3 ms on P2P and relay, and a forced ICE failure falls back to RELAY in about 4.9 s. Core bundle: **12.1 KB gzip** (budget 25 KB).

## Quick start

Requires Node.js ≥ 22.12 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev            # relay :8787 + tether-deck https://localhost:5173 + phantom-beam https://localhost:5174
```

1. Open `https://localhost:5173`. Accept the self-signed certificate (phone sensors require HTTPS).
2. Click **Try Virtual Phone (Split-View)** and drag on the phone pad. Hold the big button, or press Space.
3. To use a real phone on the same Wi-Fi, open the **Network** URL that Vite prints (for example `https://192.168.1.20:5173`) on the desktop, then scan the QR code. Accept the certificate on the phone too. If the phone can't open it, a firewall (for example `ufw`) is probably blocking the port, so use a tunnel instead.

**Real phone through an HTTPS tunnel** (valid certificate, works on mobile data). Point a Cloudflare Tunnel / ngrok hostname at `http://localhost:<port>` and run the app in plain-HTTP mode:

```bash
DEV_HTTPS=0 DEV_ALLOWED_HOSTS=my-app.example.com pnpm --filter tether-deck exec vite --port 5183
```

Open `https://my-app.example.com` **on the desktop**, so the QR code carries the tunnel address, then scan it. The signaling socket (`/tether-signal`) goes through the same tunnel.

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm dev:deck` / `pnpm dev:phantom` | Run the relay plus both apps, or one of them |
| `pnpm test` | All property-based tests (core + game rules) |
| `pnpm test:pbt` | Core properties only |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm build` | Production builds + core size check |
| `pnpm size` | Core bundle size report |

If port 5173 or 5174 is taken, run an app on another port with `pnpm --filter tether-deck exec vite --port 5183`.

## Repository layout

```
.kiro/            specs (EARS requirements → design → tasks), steering, hooks
tetherkit-core/   the skeleton SDK (protocol, transport, sensors, feedback, React UI kit) + fast-check tests
signaling-relay/  WebSocket signaling + relay (in-memory rooms, rate limits) + Dockerfile + fly.toml
tether-deck/      app 1: presenter remote, laser, 3D inspector
phantom-beam/     app 2: horror flashlight / EMF game + game-rule property tests
docs/             deployment, testing, demo script, Kiro write-up
```

## Build your own controller in 10 minutes

```tsx
// Desktop
import { useEffect } from 'react';
import { PairingCard, VirtualPhoneEmulator, useAnimationFrame, useTetherHost } from 'tetherkit-core/react';

function Host() {
  const { host, state } = useTetherHost({ app: 'my-app' });
  useAnimationFrame(() => {
    const { nx, ny, roll, primaryHeld } = host.getLatestFrame(); // [-1, 1], read every frame
    moveCursor(nx, ny, roll, primaryHeld);
  });
  useEffect(
    () => host.onAction((a) => {
      if (a.action === 'fire') host.sendFeedback({ vibratePattern: [30], audioCue: 'click' });
    }),
    [host],
  );
  return <>
    <PairingCard state={state} emulatorOpen={!!state.emulatorUrl}
      onToggleEmulator={() => (state.emulatorUrl ? host.stopEmulator() : host.startEmulator())} />
    <VirtualPhoneEmulator src={state.emulatorUrl} onClose={() => host.stopEmulator()} />
  </>;
}

// Phone (/control)
import { TetherController } from 'tetherkit-core';
import { ConnectScreen, HoldButton, useTetherController } from 'tetherkit-core/react';

function Controller() {
  const { controller, state } = useTetherController();
  if (state.status === 'idle') return <ConnectScreen controller={controller} state={state}
    target={TetherController.targetFromSearch()} appName="my-app" />;
  return <>
    <HoldButton label="AIM" onHoldChange={(h) => controller.setPrimaryHeld(h)} hotkey=" " />
    <button onClick={() => controller.sendAction('fire')}>FIRE</button>
  </>;
}
```

Copy `tether-deck/` or `phantom-beam/` for a working starting point. Each one is a single Vite build in which `/` is the desktop host and `/control` is the phone.

## Privacy & security

- Only orientation, touch deltas and button states leave the phone. The camera is never used.
- Rooms live in memory and expire after 15 minutes of inactivity. Tokens are stored as SHA-256 hashes and compared in constant time.
- The relay enforces per-IP rate limits for connections and room operations, a per-connection message budget, a 4 KB frame cap, a cap on active rooms, and an optional origin allow-list.
- Local `.glb` and Markdown files are parsed in the browser and never uploaded.
- Every inbound message is validated and clamped (`decodeMessage`, property-tested against arbitrary input).

## Built with Kiro

The `/.kiro` folder holds the full trail:

- **Specs** in EARS notation for the protocol and for each app, with correctness properties linked to tests.
- **Steering** for product, tech, structure, plus two file-scoped rules: browser sensor safety and the protocol contract.
- **Hooks:**
  - Saving protocol, sensor or feedback code runs the core property tests.
  - Saving game rules runs the game properties.
  - Saving the protocol spec asks the agent to reconcile the types.
  - A guard fails if `/.kiro` ever becomes git-ignored.

Details are in [docs/KIRO_WRITEUP.md](docs/KIRO_WRITEUP.md).

## License

[MIT](LICENSE). Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

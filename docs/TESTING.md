# Testing

## Automated

```bash
pnpm test        # 27 core property tests (11 properties) + 6 game-rule tests
pnpm typecheck   # all 4 packages
pnpm build       # production builds + core bundle budget (fails above 25 KB gzip)
```

| Suite | Properties |
| --- | --- |
| `tetherkit-core/tests/sensor-math.pbt.test.ts` | P1 angle wrapping, P2 calibration identity, P3 output clamp (NaN/∞ inputs), P4 no jump across 0/360, P11 One Euro filter (bounded, settles, less lag than the old EMA) |
| `tetherkit-core/tests/protocol.pbt.test.ts` | P5 sensor round-trip, P6 decoder robustness (2000 runs), P7 normalization stability, P8 monotonic seq guard |
| `tetherkit-core/tests/feedback.pbt.test.ts` | P9 vibration sanitizer, P10 throttle interval + heartbeat |
| `phantom-beam/tests/game.pbt.test.ts` | G1 EMF bounds + monotonicity, G3/G4 banish invariants and single ending under random play, G6 auto-walk, G7 precise 10° acquire / 14° hold lock cone |

Two properties include **non-vacuity guards**: they assert that the random inputs really exercised the interesting case (throttle repeat sends, ghost banishes). The first version of the game property passed while never banishing a single ghost. See `docs/KIRO_WRITEUP.md`.

Kiro hooks run these on save (`.kiro/hooks/run-core-pbt-on-edit.json`, `run-game-pbt-on-edit.json`).

## Browser end-to-end (what was run before submission)

The run used Playwright driving system Chrome against the dev servers. It is not part of the repo, to keep dependencies lean.

| Scenario | Result |
| --- | --- |
| deck: open host → room code shown | ✅ |
| deck: Virtual Phone → HUD `EMULATOR` | ✅ |
| deck: drag pad → laser drawn on canvas (≈2 100 lit pixels) | ✅ |
| deck: NEXT on phone → desktop `2/5`, phone shows the new title + notes | ✅ |
| deck: mode switch from phone → 3D inspector, orbit drag | ✅ |
| deck: second browser context joins with QR link → `P2P`, NEXT works | ✅ |
| deck: third context with ICE blocked → `RELAY` after ≈4.9 s, NEXT works; previous phone shows "opened on another device" | ✅ |
| phantom: Virtual Phone → START HUNT from phone → scripted aim → reveal, LOCKED, UV Surge → **AREA PURIFIED** on both screens (≈20 s) | ✅ |
| phantom: EMF events received on phone ≤ 15/s (max 11/s observed) | ✅ |
| phantom: PLAY AGAIN on phone restarts desktop | ✅ |
| v2 — "Linked!" burst on desktop + full-screen flash on phone (both apps) | ✅ |
| v2 — auto-walk: ~1.45 m in the first 2.5 s, DEPTH HUD, **0 m** while UV Surge is held | ✅ |
| v2 — phone light: `is-uv is-locked` at opacity ≈ 0.85 while surging; `is-touch` red throb on contact | ✅ |
| v2 — jump scare on desktop and phone after ~23 s of idling (ghost reached the player) | ✅ |
| v2 — positional voice for an active ghost (pan/proximity from `ghostVoices`) | ✅ |
| lock precision — acquisition inside 10°, retained to 14°; 74 px reticle and 140 px progress bar | ✅ |
| lock haptic — browser vibration spy recorded `[35,35,95]` on acquisition and `28`/`38`/`48` ms at 25/50/75% charge | ✅ |
| haptic capability — phone shows `MOTOR · TEST` when Vibration API exists, otherwise `NO MOTOR · AUDIO` | ✅ |
| no page errors / console errors in any run | ✅ |

Balance after auto-walk (headless simulation of `stepGame`, UV pressed only when LOCKED):

| Player | Result | Time | Walked |
| --- | --- | --- | --- |
| Perfect aim, 0.6 s reaction | won 4/4 | 18.9 s | 8.3 m |
| 3 s reaction | won 4/4 | 24.7 s | 12.7 m |
| 5 s reaction, ±6° wobble | won 4/4 | 32.4 s | 18.5 m |
| Idle | lost (sanity) | 26.1 s | 15.1 m |
| Random sweep with UV held | lost (sanity) | ≈ 51 s | 0 m |

Dev-only hooks used by the scripted run (stripped from production builds): `window.__tetherController` (phone page) and `window.__phantomEngine` (phantom host).

## Orbit responsiveness (after real-phone feedback)

Offline filter comparison at 60 Hz (normalized units, 1 unit = 35°):

| Filter | Step to 90 % | Lag at 45°/s | Lag at 90°/s | Still-hand jitter (σ) |
| --- | --- | --- | --- | --- |
| EMA α 0.35 (before) | 100 ms | 31 ms | 31 ms | 0.00106 |
| **One Euro 1 Hz / β 8 (now)** | **33 ms** | **9 ms** | **6 ms** | **0.00055** |

The browser check used synthetic `deviceorientation` events at 60 Hz, P2P on one machine:
- A 20° turn reached 90 % on the desktop in about 25 ms.
- Pressing ORBIT re-zeroed the pose (`nx` went 0.571 → 0).
- Turning another 20° while holding gave the full range again (`nx` 0.571).

The host slerp went from τ ≈ 55 ms to ≈ 33 ms.

## Manual device matrix (to do on real hardware before the deadline)

- [ ] Android Chrome: gyro, **tap MOTOR · TEST and confirm vibration**, confirm the distinct lock double-pulse plus 25/50/75% charge pulses, Wake Lock, P2P on Wi-Fi, P2P/relay on 4G/5G
- [ ] iPhone Safari: permission prompt in the Connect tap, **NO MOTOR · AUDIO** is expected (Safari has no Vibration API), audio + edge-glow fallback, Wake Lock (iOS 18.4+)
- [ ] In-app browser (WhatsApp / Instagram): banner + touch trackpad
- [ ] One-laptop judge flow in incognito: a deck round + a phantom hunt in < 90 s

# Implementation Plan — phantom-beam

- [x] 1. App shell
  - [x] 1.1 Vite + React app with role split and lazy chunks; HTTPS dev on :5174
  - [x] 1.2 `phantom-protocol.ts` (actions, `PhantomSync`, EMF thresholds)

- [x] 2. Pure game rules (`src/host/game`)
  - [x] 2.1 `computeEmf`, `aimDirection`, `alignment`
    - _Requirements: 2.2_
  - [x] 2.2 Spawn plan, Wraith and Mimic AI (approach, weave, strafe, edge-dodge)
    - _Requirements: 2.1, 2.5_
  - [x] 2.3 Reveal with fog factor, lock selection, UV Surge progress with decay
    - _Requirements: 2.4, 4.1, 4.2_
  - [x] 2.4 Contact drain, win/lose, scoring, `snapshot()`
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 2.5 Headless balance simulation (5 seeds × oracle/slow-oracle/idle/sweep) → tuned fog reveal
    - _Requirements: 5_
  - [x] 2.6 Property tests G1 (EMF bounds + monotonicity) and G3/G4 (banish bounds, lock-only progress, single ending)
    - _Requirements: 2.2, 4.1, 4.2, 5_

- [x] 3. Rendering (`CorridorEngine`)
  - [x] 3.1 Procedural stone textures, corridor geometry, pillars, arches, rubble, candles, door glow
    - _Requirements: 1.1_
  - [x] 3.2 Camera-held SpotLight with shadows + additive beam cone shader + UV colour shift
    - _Requirements: 1.2, 4.4_
  - [x] 3.3 Ghost sprites (wraith/mimic textures, auras), banish shake, dissolve, particle bursts
    - _Requirements: 2.4, 4.3_
  - [x] 3.4 Breathing camera, contact shake, attract-mode sweep
    - _Requirements: 1.3, 5.2_

- [x] 4. Host app
  - [x] 4.1 HUD (time, sanity, purified, score, EMF LEDs), LOCKED bar, vignette, UV tint, scanlines
  - [x] 4.2 Lobby / win / lose overlays, START HUNT / PLAY AGAIN, Enter shortcut
    - _Requirements: 5.4_
  - [x] 4.3 Throttled EMF + state downstream; discrete cues on events
    - _Requirements: 2.3, 4.3_
  - [x] 4.4 Procedural `AmbientSynth`, volume + mute
    - _Requirements: 6.1_

- [x] 5. Phone EMF reader
  - [x] 5.1 `EmfMeter` (needle + 5 LEDs + readout)
    - _Requirements: 3.1_
  - [x] 5.2 `GeigerCounter` Poisson clicks + rate-limited buzz
    - _Requirements: 3.2, 3.3_
  - [x] 5.3 Stats, touch flashlight pad, UV Surge hold button with ring, START/PLAY AGAIN, mute
    - _Requirements: 4.4, 5.4, 6.2_

- [x] 6. Verification
  - [x] 6.1 Typecheck + production build
  - [x] 6.2 Browser E2E full hunt (won in ~20 s with scripted aim), EMF rate ≤ 15/s, replay from phone, screenshot review

- [x] 7. "Wow" pass (v2)
  - [x] 7.1 Auto-walk: `playerZ`/`walkSpeed` in the rules, ghosts spawn and touch relative to the player, corridor extended to 64 m, camera bob/sway, footsteps, DEPTH HUD
    - _Requirements: 7.1–7.5_
  - [x] 7.2 Re-balance with the headless simulation (walk 1.0 m/s, EMF brake 0.5, slower ghosts); property G6 + "empty corridor" test
    - _Requirements: 5, 7_
  - [x] 7.3 Phone screen as a light: UV glow scaled by progress and pulsing when locked, ≤ 1 Hz blood-red throb on contact, pointer-transparent, reduced-motion safe
    - _Requirements: 8.1–8.4_
  - [x] 7.4 Positional ghost voices (`ghostVoices` + per-ghost `StereoPannerNode` graphs)
    - _Requirements: 9.1, 9.2_
  - [x] 7.5 Procedural scare faces (`shared/scare-face.ts`), desktop lunge overlay + scream, phone scare via `scare` counter, 4 s cooldown, final big scare, SCARES toggle
    - _Requirements: 9.3–9.5_
  - [x] 7.6 Browser E2E: linked moment on both screens, ~1.45 m walked in 2.5 s, no walking while UV held, phone light classes, desktop + phone scare at ~23 s of idling

- [x] 8. Lock precision + haptic feedback pass
  - [x] 8.1 Narrow acquisition from ≈23° to 10°; add 14° hold hysteresis and prevent another ghost stealing a retained lock
    - _Requirements: 4.1_
  - [x] 8.2 Add a 74 px centre reticle and reduce TARGET LOCKED bar from 220 px to 140 px
    - _Requirements: 4.6_
  - [x] 8.3 Lock-acquired haptic `[35,35,95]`, charge pulses at 25/50/75%, MOTOR · TEST / NO MOTOR · AUDIO capability button
    - _Requirements: 4.2, 4.3_
  - [x] 8.4 Add G7 tests and re-run balance simulation; browser test records the lock pattern and all three charge pulses through a `navigator.vibrate` spy
    - _Requirements: 4_


# Implementation Plan — tether-deck

- [x] 1. App shell
  - [x] 1.1 Vite + React app with role split (`/` host, `/control` phone) and lazy chunks
  - [x] 1.2 HTTPS dev server + `/tether-signal` proxy; `vercel.json` / `_redirects` SPA rewrites
  - [x] 1.3 `deck-protocol.ts` actions and `DeckSync`
    - _Requirements: 5.1_

- [x] 2. Laser & Slides
  - [x] 2.1 Markdown slide parser + inline tokenizer (no HTML injection)
    - _Requirements: 2.6_
  - [x] 2.2 Built-in 5-slide deck with speaker notes
  - [x] 2.3 `SlidePresenter` 16:9 container-query layout
  - [x] 2.4 `LaserOverlay` ring-buffer trail on rAF
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 2.5 Presentation timer (start on first nav, pause/reset, talk length) + 60 s / 0 s warnings
    - _Requirements: 2.2, 2.3_
  - [x] 2.6 Keyboard / clicker navigation
    - _Requirements: 2.5_

- [x] 3. 3D Inspector
  - [x] 3.1 Renderer, environment lighting, shadows, ground grid
  - [x] 3.2 Procedural Server Node + Gyro Artifact models with idle animation
    - _Requirements: 4.1_
  - [x] 3.3 Clutch orbit from phone, slerp smoothing, idle auto-rotate
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 3.4 Zoom (actions, wheel), mouse drag fallback
    - _Requirements: 3.3_
  - [x] 3.5 Local `.glb` loading in memory + normalize + dispose
    - _Requirements: 4.2_

- [x] 4. Phone controller
  - [x] 4.1 Connect screen (core) + emulator auto-connect
  - [x] 4.2 Slides panel: counter, title, timer, notes with swipe, touch laser pad
    - _Requirements: 2.1, 1.4_
  - [x] 4.3 Inspector panel: model cycling, orbit pad with spring-back + pinch zoom
    - _Requirements: 3.5, 4.3_
  - [x] 4.4 HOLD TO LASER / ORBIT button (Space hotkey), PREV/NEXT, ZOOM ±
  - [x] 4.5 Haptic cues: slide change, edge bump, mode change, connect

- [x] 5. Verification
  - [x] 5.1 Typecheck + production build
  - [x] 5.2 Browser E2E (emulator, P2P, relay fallback) + screenshot review

# Requirements Document — tether-deck

## Introduction

`tether-deck` is the first app built on `tetherkit-core`. It is a productivity tool: the phone becomes a gyroscopic laser pointer, a presentation remote showing notes and a timer, and a wrist-controlled orbit tool for 3D models. Source: PRD §6.2 (FR-DECK-01..04) and persona Raka.

## Glossary

- **Laser & Slides mode**: a 16:9 slide stage with a laser canvas overlay.
- **3D Inspector mode**: a Three.js viewport with built-in or local `.glb` models.
- **Clutch orbit**: rotation is applied only while the Orbit button is held, relative to the pose at grab time.
- **syncState**: deck state pushed to the phone (`DeckSync` in `src/shared/deck-protocol.ts`).

## Requirements

### Requirement 1 — Laser pointer (FR-DECK-01)

**User Story:** As a presenter, I want to point at slide content by tilting my phone.

#### Acceptance Criteria

1. WHILE the primary button is held in Laser & Slides mode, THE Host SHALL map `(nx, ny)` ∈ [-1, 1]² to the slide stage and draw a glowing dot with a trail of the last 12 positions.
2. WHEN the button is released, THE trail SHALL fade out within 12 frames.
3. THE laser SHALL render on its own `requestAnimationFrame` loop without React re-renders.
4. IF the phone uses Touch Trackpad mode, THEN dragging the pad SHALL count as holding the laser.

### Requirement 2 — Slide navigation and sync (FR-DECK-02)

**User Story:** As a presenter, I want to change slides and read my notes on the phone.

#### Acceptance Criteria

1. WHEN the user taps NEXT/PREV or swipes horizontally on the notes panel, THE Host SHALL change slides, and THE phone SHALL show the new number, title and speaker notes.
2. THE phone SHALL show elapsed and remaining time for the chosen talk length (5/10/15/20 min). THE timer SHALL start on the first navigation and can be paused/reset from either screen.
3. WHEN 60 s remain and when time is up, THE phone SHALL receive a warning cue and vibration.
4. WHEN navigation hits the first or last slide, THE phone SHALL get a distinct "bump" vibration.
5. THE desktop SHALL also accept ←/→, PageUp/PageDown and Space (presentation clickers).
6. WHEN a Markdown file is loaded locally, THE Host SHALL parse it into slides (`---` separators, `# title`, `> lead`, `- bullets`, fenced code, `Note:` speaker notes) without injecting HTML.

### Requirement 3 — 3D orbit and zoom (FR-DECK-03)

**User Story:** As a 3D designer, I want to turn a model with my wrist.

#### Acceptance Criteria

1. WHILE Orbit is held, THE Host SHALL rotate the model by the change in yaw/pitch/roll since the grab started (yaw → Y, pitch → X, roll → Z), smoothed with a short slerp (≈ 33 ms).
2. WHEN Orbit is released and pressed again, rotation SHALL continue from the current orientation (clutch).
3. WHEN Orbit is pressed in gyro mode, THE phone SHALL zero its pose first (`recenter({ quiet: true })`), so every grab has the full ±35° wrist range and the model never stops turning because the phone was already off-centre.
3. WHEN the user pinches the pad or taps ZOOM ±, THE camera distance SHALL change within [2.2, 9]. Mouse wheel and drag SHALL work on the desktop.
4. IF there is no input for 4 s, THEN THE model SHALL slowly auto-rotate.
5. IF the phone uses Touch Trackpad mode, THEN the pad SHALL act like a spring-back joystick, so each drag is one orbit gesture.

### Requirement 4 — Models (FR-DECK-04)

#### Acceptance Criteria

1. THE app SHALL ship two procedural models ("Modular Cyber Server Node" and "Mechanical Gyro Artifact") with idle animation, and no binary assets.
2. WHEN the user picks a local `.glb` (≤ 50 MB), THE Host SHALL parse it in memory with `GLTFLoader.parseAsync`, center and scale it, and never upload it.
3. THE phone SHALL be able to cycle models ("Next model").

### Requirement 5 — Mode switching and telemetry

#### Acceptance Criteria

1. WHEN either screen switches mode, THE other SHALL follow, and the connection SHALL stay up.
2. THE Host SHALL show a HUD with transport, latency, sensor Hz, render FPS, input source and phone battery.
3. THE app SHALL work fully with the Split-View Virtual Phone.

# Requirements Document — phantom-beam

## Introduction

`phantom-beam` is the second app on `tetherkit-core`, deliberately unlike the first. It is a 60-second asymmetric horror game. The desktop shows a dark gothic corridor, and the phone is the player's flashlight and EMF meter. Upstream, phone motion sweeps the beam. Downstream, ghost proximity drives Geiger clicks, haptics and LEDs on the phone. Source: PRD §6.3 (FR-PHAN-01..05) and persona Dina.

## Glossary

- **Beam**: the desktop SpotLight + visible cone aimed by `(nx, ny)`.
- **Entity**: a ghost. *Stalker Wraith* drifts toward the player and slows when lit. *Shadow Mimic* strafes and dodges when it sits in the beam's edge.
- **cosθ**: alignment between the beam direction and the direction to an entity.
- **EMF**: 0–1 signal sent to the phone.
- **UV Surge**: holding the primary button to banish a locked entity.
- **Sanity**: 0–100 player health, drained by contact.

## Requirements

### Requirement 1 — Corridor and flashlight (FR-PHAN-01)

**User Story:** As a player, I want the flashlight to follow my phone in real time.

#### Acceptance Criteria

1. WHEN a session runs, THE Host SHALL render a fogged stone corridor (pillars, arches, rubble, candles, far door) lit mainly by one shadow-casting SpotLight.
2. THE beam SHALL follow `(nx, ny)` (yaw ±48°, pitch ±28°) with slight hand inertia, plus a visible additive light cone.
3. WHILE no phone is connected, THE beam SHALL sweep by itself (attract mode).
4. THE game loop SHALL run on `requestAnimationFrame` outside React.

### Requirement 2 — Entities and EMF (FR-PHAN-02)

**User Story:** As a player, I want my phone to tell me where the ghosts are.

#### Acceptance Criteria

1. THE game SHALL spawn 4 entities (Wraith, Mimic, Wraith, Mimic) at planned times, ahead of the player's current position, with at most 2 active, and pull the next spawn forward when the corridor has been empty for 1.2 s.
2. EVERY frame, THE Host SHALL compute, for each active entity, `d = clamp(distance / 22)` and `emf = clamp((1 − d)·0.65 + max(0, cosθ)·0.35)`, and use the maximum.
3. THE Host SHALL send EMF to the phone at most 15 times per second (≥ 66 ms apart), early when it changes by more than 0.03, and as a heartbeat at least every 250 ms.
4. AN entity's visibility SHALL rise when it is inside the beam (cosθ > 0.90) and partially at the edge (0.80–0.90). Fog SHALL keep entities beyond about 20 m unrevealed.
5. WHILE a Shadow Mimic stays in the beam edge (outside the 10° lock cone but cosθ > 0.80) for more than 0.9 s, THE Mimic SHALL dodge to the other side.

### Requirement 3 — Phone EMF reader (FR-PHAN-03)

#### Acceptance Criteria

1. WHEN EMF > 0.15, THE phone SHALL light LED segments (thresholds 0.15 / 0.35 / 0.55 / 0.75 / 0.90, green → red with the top segment blinking) and move an analog needle.
2. WHEN EMF > 0.15, THE phone SHALL play Geiger clicks as a Poisson process whose rate rises from 1.5 to ~32 clicks/s, so intervals shorten as EMF rises.
3. EACH click SHALL produce an audio tick and an edge-glow pulse. WHEN EMF > 0.3, THE phone SHALL also buzz the motor (Android), at most every 70 ms.

### Requirement 4 — UV Surge banishment (FR-PHAN-04)

#### Acceptance Criteria

1. WHEN a revealed entity enters the exact 10° centre cone, THE System SHALL acquire a lock. WHEN that same entity remains within a wider 14° hold cone, THE System SHALL retain it so hand tremor does not flicker the lock; another entity SHALL NOT steal a retained lock.
2. WHEN a lock is first acquired, THE phone SHALL issue a distinct `[35, 35, 95]` haptic pattern. If the browser has no Vibration API, `FeedbackDispatcher` SHALL substitute audio and edge glow. The phone SHALL expose a MOTOR · TEST or NO MOTOR · AUDIO button.
3. WHILE the beam is locked on a revealed entity and UV Surge is held, THE entity's banish progress SHALL rise by 1 per 2.0 s, the entity SHALL freeze, and the phone SHALL issue a short progress pulse at 25, 50 and 75%.
4. WHEN the lock or the button is released, progress SHALL decay slowly (0.35/s) instead of resetting.
5. WHEN progress reaches 100 %, THE entity SHALL dissolve into a particle burst, the score SHALL grow by 100 + remaining seconds, and the phone SHALL get the `banish` cue and vibration.
6. THE phone UV button SHALL show a progress ring and a LOCKED state. THE desktop SHALL show a compact 74 px centre reticle plus a 140 px TARGET LOCKED progress bar.

### Requirement 5 — Win, lose and replay (FR-PHAN-05)

#### Acceptance Criteria

1. WHEN all 4 entities are banished before 60 s, THE game SHALL show "AREA PURIFIED" on both screens and add a sanity + time bonus.
2. WHEN an entity reaches the player (< 1.6 m), it SHALL drain 20 sanity/s per touching entity, with a red throbbing vignette and camera shake.
3. IF sanity reaches 0, THEN the game SHALL show "SANITY LOST". IF time runs out, THEN it SHALL show "TIME'S UP".
4. WHEN either screen presses START HUNT / PLAY AGAIN (or Enter), BOTH screens SHALL start a new session.

### Requirement 6 — Audio and controls

#### Acceptance Criteria

1. THE desktop SHALL play a procedural soundscape (drone, wind, footsteps, positional ghost voices, a heartbeat below 70 % sanity, UV hum, banish/shriek/scream/win/lose stingers) with a volume slider and mute.
2. THE phone SHALL have its own mute toggle.
3. THE game SHALL be fully playable with the Split-View Virtual Phone (drag to aim, Space for UV, Enter to start).

### Requirement 7 — Auto-walk through the corridor

**User Story:** As a player, I want to move deeper into the corridor, so that the hunt feels like exploring rather than standing still.

#### Acceptance Criteria

1. WHILE a hunt is running, THE player SHALL advance along the corridor automatically, easing up to 1.0 m/s in an empty corridor and slowing as EMF rises (speed × (1 − 0.5·EMF)).
2. WHILE UV Surge is held or an entity is touching the player, THE player SHALL NOT move.
3. THE player SHALL never move backwards and SHALL stop 38 m in, before the far door.
4. Entities SHALL spawn relative to the player's current position (Wraith 24 m ahead, Mimic 18 m ahead), and contact SHALL be measured from the player's position.
5. THE camera SHALL follow the player with a walking bob and sway, a footstep SHALL sound every 0.75 m, and the HUD SHALL show the depth walked.

### Requirement 8 — The phone screen as a light source

**User Story:** As a player in a dark room, I want my phone to light up for real, so that the game reaches into the physical world.

#### Acceptance Criteria

1. WHILE UV Surge is held during a hunt, THE phone screen SHALL fill with a bright UV-purple light that grows stronger with banish progress and pulses when the beam is locked.
2. WHILE an entity touches the player, THE phone screen SHALL throb blood red at most once per second (well under the 3-flashes-per-second photosensitivity limit).
3. THE light overlay SHALL NOT block touch input (the UV button keeps working through it).
4. WHERE the OS asks for reduced motion, THE light SHALL stay steady with no pulsing.

### Requirement 9 — Spatial voices and jump scares

**User Story:** As a player, I want to hear where the ghosts are and be startled when they reach me.

#### Acceptance Criteria

1. EACH active entity SHALL have its own procedural voice (Wraith: breathy whisper, Mimic: low growl) whose loudness follows proximity (hearing range 22 m) and whose stereo position follows the entity's horizontal angle relative to the view.
2. A voice SHALL rise in pitch while the entity is being banished, and fade out when it is gone.
3. WHEN an entity first touches the player and jump scares are enabled, BOTH screens SHALL show that entity's face lunging at the viewer with a scream, and the phone SHALL get a heavy vibration. Scares SHALL be at least 4 s apart.
4. WHEN sanity reaches 0 and scares are enabled, a longer final scare SHALL play before the SANITY LOST screen.
5. THE desktop SHALL have a SCARES ON/OFF toggle that also controls the phone. It SHALL default to OFF when the OS asks for reduced motion.

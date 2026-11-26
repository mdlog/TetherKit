# How I used Kiro

## At a glance

| Kiro feature | What is in the repo | What it did for the project |
| --- | --- | --- |
| **Kiro IDE agent** (Autopilot) | One long build session: 18 prompts, 561 agent tool calls | Turned an EARS-style PRD and architecture doc into the core SDK, the relay and both apps |
| **Specs** | 3 specs in `.kiro/specs/`: `tether-protocol` (12 requirements, 48 tasks), `tether-deck` (5 requirements, 26 tasks), `phantom-beam` (9 requirements, 39 tasks) | Every message type, sensor formula and game rule has a written contract and a numbered correctness property |
| **Steering** | 5 files: 3 always included, 2 scoped with `fileMatch` | Browser-sensor and protocol rules load only when that code is open |
| **Agent hooks** | 4 hooks, created with Kiro's hook tool. They fired **21 times** during the build | Property tests run on every save, and a spec edit makes the agent reconcile the protocol code |
| **Property-based testing** | 11 core properties (27 tests) and 4 game-rule properties (6 tests) with fast-check, up to 2,000 runs per property | Caught a vacuous property and a flaky guard, and pinned down a filter rewrite |

## Starting point: a spec before any code

Before opening Kiro I wrote two documents: a PRD (`PRD.md`) with functional requirements in EARS form, and an architecture doc (`ARCHITECTURE.md`). Both were originally in Indonesian, and the repo now holds English translations. My first prompt asked the Kiro agent to study them against the Kiroween rules, then build.

The agent ran in Autopilot. It built the core SDK, the signaling relay and both apps from those documents, then captured the result as Kiro specs, steering and hooks. From that point on, changes went through the specs. When real-phone testing turned up a problem, the fix started as a new requirement or property, and the code followed:

- **3D orbit felt slower than the mouse** on a real phone. The fixed EMA was replaced with a One Euro filter, and property **P11** now requires it to stay bounded, settle within 1 s, and lag a fast turn less than the old EMA.
- **"Why can't I walk down the corridor?"** led to auto-walk in phantom-beam. Property **G6** pins down the walking rules, and the balance row **G5** was re-tuned with simulation (see below).
- **Locking onto a ghost gave no vibration, and the target area was too wide.** The lock became a 10° cone with 14° hysteresis and haptic pulses at 25/50/75 % banish progress. Property **G7** covers the cone.

## Spec-driven development

Each spec in `.kiro/specs/` has `requirements.md` (EARS), `design.md` and `tasks.md`:

- **tether-protocol** covers the SDK and the relay, from pairing to relay safety and the bundle budget. Its design holds the wire formats, the connection state machine, the sensor math, and a **Correctness Properties** table (P1–P11). Each property maps to a fast-check test and to the requirement it validates.
- **tether-deck** and **phantom-beam** each build on the protocol spec. They define app-level actions, the `syncState` shape and their own invariants (D1–D4 and G1–G7).

Vibe coding got the first build on screen fast. The specs are what kept it from drifting once I started changing things on real phones. They also gave every module a contract before its code existed. Two examples:

- The EARS line "WHEN the user taps Connect & Enable Sensors, THE Controller SHALL call `DeviceOrientationEvent.requestPermission()` synchronously within that tap handler" forced a single `connectFromGesture()` entry point. It also unlocks audio and the wake lock in the same gesture. Missing that gesture binding is the classic iOS bug that is hard to track down later.
- The protocol requires the decoder and relay to reject anything over 4096 characters. That limit is why the deck truncates speaker notes before they go into `syncState`.

## Steering

- `product.md`, `tech.md` and `structure.md` are always included.
- `sensor-browser-safety.md` uses `fileMatch` on `tetherkit-core/src/{sensors,feedback}/**`. It encodes the browser rules that break silently on phones: gesture-bound permission, vibration limits, the iOS audio fallback, re-acquiring the wake lock, and the HTTPS requirement.
- `protocol-contract.md` uses `fileMatch` on the protocol and transport folders. It requires every transport to carry identical strings, the decoder to never throw, and every new field to get a validator and a property.

Scoping the strict rules with `fileMatch` helped most. The sensor rules load only when sensor code is open, so they stay precise without cluttering every request.

## Agent hooks (`.kiro/hooks/`)

The agent created all four hooks with Kiro's hook tool. The counts come from the build session log.

| Hook | Trigger | Action | Fired |
| --- | --- | --- | --- |
| `run-game-pbt-on-edit` | PostFileSave on `phantom-beam/src/host/game/*.ts` | `pnpm --filter phantom-beam test` | 10× |
| `sync-protocol-on-spec-save` | PostFileSave on the protocol `requirements.md` / `design.md` | Agent prompt: reconcile `types.ts`, `codec.ts`, `signal-types.ts` and the property table, then run tests and typecheck | 6× |
| `run-core-pbt-on-edit` | PostFileSave on `tetherkit-core/src/(protocol\|sensors\|feedback)/*.ts` | `pnpm --filter tetherkit-core test:pbt` | 5× |
| `guard-kiro-not-ignored` | PostFileSave on `.gitignore` | Fails loudly if `/.kiro` becomes git-ignored, which would disqualify the entry | safety net |

The two test hooks are shell commands, so they cost no credits. Only the spec-sync hook calls the agent, because reconciling code with a changed spec needs judgment.

## Property-based testing

`pnpm test` runs 11 core properties (27 tests) and 4 game-rule properties (6 tests). The test plan is in `docs/TESTING.md`. Here is what PBT caught or shaped:

- **A vacuous property.** The first game-rule property passed 150 runs, but a coverage probe showed that **0 of 150 runs ever banished a ghost**. `fc.double({min: 0, max: 0.1})` clusters near zero, so simulated time barely advanced. The fix was uniform millisecond steps, inputs biased toward aimed play with UV held, and an explicit non-vacuity assertion (`runsWithBanish > 15`). The throttle property got the same treatment. Plain unit tests would not have revealed this.
- **A flaky guard, caught by a hook.** Editing the protocol spec fired `sync-protocol-on-spec-save`, and its test run failed. The throttle's non-vacuity guard was an absolute count (more than 100 repeat sends), and random inputs landed at 85–98 about half the time. It became a ratio: more than 50 % of runs must send at least twice. It then passed 15 of 15 repeated runs.
- **Exact zero after Recenter.** The calibration-identity property (P2) demands exactly `(0, 0, 0)`, compared with `Object.is` semantics. So the sensor path normalizes `-0` to `+0` by design, and a deadzone keeps floating-point noise from leaking through.
- **Decoder fuzzing.** 2,000 runs per property over arbitrary strings, arbitrary JSON and near-miss envelopes keep `decodeMessage` total (it never throws) and keep its output well-formed. A normalization-stability property checks that one encode/decode cycle reaches a fixed point.

## Beyond tests: simulation-driven tuning

The phantom-beam rules are pure functions, so the agent ran a headless balance simulation: 5 seeds × 4 player strategies. It showed that ghosts could be locked at their 24 m spawn point. The fog-reveal factor was tightened and the simulation run again.

Adding auto-walk changed the closing speed between player and ghosts, so the same simulation drove a second retune. The first walking speed (0.6 m/s with a strong EMF brake) gave only 5–10 m of travel per hunt, which didn't feel like moving through a corridor. With the final values (1.0 m/s, brake 0.5, slower ghosts), perfect aim wins in about 19 s. A slow player with a wobbly ±6° aim walks about 18 m and still wins in about 32 s, and an idle player loses at about 26 s. The spec's G5 row records these numbers.

## MCP, Powers, custom agents, Kiro Crew

Not used in this build.

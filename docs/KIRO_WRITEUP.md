# How Kiro was used (draft for the Devpost submission)

> Draft. Edit it in your own words before submitting, and add anything you did in Kiro that is not captured here (for example, which Kiro surfaces you tried).

## Kiro surface
Built in the **Kiro IDE**, using the agent in Autopilot mode. The PRD (`PRD.md`) and architecture doc (`Arsitektur.md`) already used EARS-style requirements, and they were the agent's starting spec. The agent implemented the core and both apps from them, then captured the result as Kiro specs, steering and hooks. Those specs drove follow-up work: writing the phantom-beam Correctness Properties table led to new game-rule property tests, and those tests exposed a vacuous generator (see below).

## Spec-driven development
Three specs live in `.kiro/specs/`. Each one has `requirements.md` (EARS), `design.md` and `tasks.md`:

- **tether-protocol** covers the SDK and the relay: 11 requirements, from pairing to relay safety and the bundle budget. Its design holds the message wire formats, the connection state machine, the sensor math, and a **Correctness Properties** table (P1–P10). Each property maps to a fast-check test and to the requirement it validates.
- **tether-deck** and **phantom-beam** each sit on top of the protocol spec. They define app-level actions, the `syncState` shape and their own invariants (D1–D4, G1–G5).

Compared with vibe coding, the spec gave every module a contract before any code existed. Two examples:
- Writing the EARS line "WHEN the user taps Connect, call `requestPermission()` synchronously in that handler" forced a single `connectFromGesture()` entry point. It unlocks audio and the wake lock in the same gesture, which is the classic iOS failure that is hard to debug later.
- The 4096-character message cap in the protocol requirements led directly to truncating speaker notes in the deck's `syncState`.

## Steering
- `product.md`, `tech.md` and `structure.md` are always included.
- `sensor-browser-safety.md` uses `fileMatch` on `tetherkit-core/src/{sensors,feedback}/**`. It encodes the browser rules that break silently on phones: gesture-bound permission, vibration limits, the iOS audio fallback, wake-lock re-acquire, and the HTTPS requirement.
- `protocol-contract.md` uses `fileMatch` on the protocol and transport folders. It requires that every transport carries identical strings, that the decoder never throws, and that every new field gets a validator and a property.

The strategy that helped most was scoping the strict rules with `fileMatch`. The sensor rules only load when sensor code is open, so they stay precise without cluttering every request.

## Agent hooks (`.kiro/hooks/`)
| Hook | Trigger | Action |
| --- | --- | --- |
| `run-core-pbt-on-edit` | PostFileSave on `tetherkit-core/src/(protocol\|sensors\|feedback)/*.ts` | `pnpm --filter tetherkit-core test:pbt` (shell command, so it costs no credits) |
| `run-game-pbt-on-edit` | PostFileSave on `phantom-beam/src/host/game/*.ts` | `pnpm --filter phantom-beam test` |
| `sync-protocol-on-spec-save` | PostFileSave on the protocol `requirements.md` / `design.md` | Agent prompt: reconcile `types.ts`, `codec.ts`, `signal-types.ts` and the PBT table, then run tests + typecheck |
| `guard-kiro-not-ignored` | PostFileSave on `.gitignore` | Fails loudly if `/.kiro` becomes git-ignored, which would disqualify the entry |

## Property-based testing
There are 10 core properties and 3 game-rule properties (see `docs/TESTING.md`). Things PBT caught or shaped:

- **A vacuous property.** The first game-rule property passed 150 runs, but a coverage probe showed **0 of 150 runs ever banished a ghost**. `fc.double({min: 0, max: 0.1})` clusters near zero, so simulated time barely advanced. The fix was uniform millisecond steps, inputs biased toward aimed UV-held play, and an explicit non-vacuity assertion (`runsWithBanish > 15`). The throttle property got the same treatment. Plain unit tests would not have revealed this.
- **A flaky guard, caught by a hook.** Editing the protocol spec fired `sync-protocol-on-spec-save`, and its test run failed. The throttle's non-vacuity guard was an absolute count (`> 100` repeat sends), and random inputs landed at 85–98 about half the time. It became a ratio (more than 50 % of runs must send at least twice). Now 15 of 15 repeated runs pass.
- **Responsiveness.** Real-phone testing showed 3D orbit felt slower than the mouse. The fixed EMA was replaced with a One Euro filter, and property P11 now requires it to stay bounded, settle within 1 s, and lag a fast turn less than the old EMA.
- **Exact zero after Recenter.** The calibration-identity property demands exactly `(0, 0, 0)`, compared with `Object.is` semantics. So the sensor path normalizes `-0` to `+0` by design, and the deadzone keeps floating-point noise from leaking through.
- **Decoder fuzzing.** 2000 runs per property over arbitrary strings, arbitrary JSON and near-miss envelopes keep `decodeMessage` total (it never throws) and keep its output well-formed. A normalization-stability property checks that one encode/decode cycle reaches a fixed point.

## Beyond tests: simulation-driven tuning
The phantom-beam rules are pure functions, so the agent ran a headless balance simulation (5 seeds × 4 player strategies). It showed ghosts were lockable at their 24 m spawn point. The fog-reveal factor was tightened and the simulation re-run: perfect aim now wins in about 18–25 s, while idling or random sweeping loses.

Adding auto-walk changed the closing speed between player and ghosts, so the same simulation drove a second retune. The first walking speed (0.6 m/s with a strong EMF brake) gave only 5–10 m of travel per hunt, which didn't feel like moving through the corridor. The final values (1.0 m/s, brake 0.5, slower ghosts) let a slow, wobbly player walk about 18 m and still win in about 32 s, while an idle player loses at about 26 s. The spec's G5 row records these numbers, and a new property (G6) pins down the walking rules.

## MCP / Powers / Custom agents
Not used in this build. *(If you try any before the deadline, describe it here.)*

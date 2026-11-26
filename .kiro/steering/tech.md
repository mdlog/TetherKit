# Tech stack & conventions

## Stack
- pnpm workspaces monorepo, Node.js >= 22.12.
- TypeScript ~5.9 in `strict` mode with `verbatimModuleSyntax` (use `import type` for types).
- React 19 + Vite 8 for both apps. Three.js r187 is used directly (no react-three-fiber).
- `ws` for the relay, bundled to a single CommonJS file with esbuild.
- Vitest + fast-check for property-based tests in `tetherkit-core/tests`.

## Commands
| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Dev (relay + both apps) | `pnpm dev` |
| Typecheck everything | `pnpm typecheck` |
| Property-based tests | `pnpm test:pbt` |
| Production build | `pnpm build` |
| Core bundle size | `pnpm size` |

Never start long-running watchers (`pnpm dev`, `vitest` without `--run`) from an agent shell. Ask the user to run them.

## Rules for code
- **No per-frame React state.** Sensor frames arrive at 60 Hz. Read `host.getLatestFrame()` inside a `requestAnimationFrame` loop and touch the DOM or WebGL directly. React state is fine for 1–15 Hz data (HUD, sync state).
- **Core is app-agnostic.** `tetherkit-core` never imports from an app. App-specific action names and `syncState` shapes live in each app's `src/shared/*-protocol.ts`.
- **All wire input is untrusted.** Every inbound message goes through `decodeMessage()`, which clamps numbers and drops unknown fields. Never `JSON.parse` a DataChannel payload yourself.
- **No HTML injection.** Markdown slides are tokenized into React elements, so `dangerouslySetInnerHTML` is not used.
- **Local files stay local.** `.glb` and `.md` uploads are parsed in memory and never sent anywhere.
- **No binary third-party assets.** Generate models, textures and sounds in code. If you add a dependency or asset, update `THIRD_PARTY_NOTICES.md`.
- **Secrets** belong in env vars (`VITE_*` are public build-time values, so never put secrets there).
- Prefer small pure functions for math and rules (`sensors/math.ts`, `phantom-beam/src/host/game/session.ts`) so they stay testable.

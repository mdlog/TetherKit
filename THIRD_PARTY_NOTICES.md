# Third-Party Notices

TetherKit is MIT licensed (see `LICENSE`). It uses the open-source components below. Their licenses apply to their code. Exact versions are pinned in `pnpm-lock.yaml`.

## Shipped in the browser bundles

| Component | Used for | License | Copyright |
| --- | --- | --- | --- |
| [React](https://github.com/facebook/react) / React DOM | UI | MIT | Meta Platforms, Inc. and affiliates |
| [three.js](https://github.com/mrdoob/three.js) (incl. `GLTFLoader`, `RoomEnvironment` addons) | 3D rendering | MIT | three.js authors |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | QR code in the pairing card | MIT | Kazuhiko Arase |

> "QR Code" is a registered trademark of DENSO WAVE INCORPORATED (notice required by qrcode-generator).

## Shipped in the relay server bundle

| Component | Used for | License | Copyright |
| --- | --- | --- | --- |
| [ws](https://github.com/websockets/ws) | WebSocket server | MIT | Einar Otto Stangvik, Arnout Kazemier, Luigi Pinca and contributors |

## Build and test tooling (not shipped)

| Component | License |
| --- | --- |
| [Vite](https://github.com/vitejs/vite), [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react), [@vitejs/plugin-basic-ssl](https://github.com/vitejs/vite-plugin-basic-ssl) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT |
| [fast-check](https://github.com/dubzzz/fast-check) | MIT |
| [esbuild](https://github.com/evanw/esbuild) | MIT |
| [tsx](https://github.com/privatenumber/tsx) | MIT |
| `@types/react`, `@types/react-dom`, `@types/three`, `@types/ws`, `@types/node` ([DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)) | MIT |

## Network services

- **Google public STUN server** (`stun:stun.l.google.com:19302`) is the default ICE server. It is used only to discover public addresses for WebRTC and carries no app data. Replace it with your own through `VITE_ICE_SERVERS`.

## Assets

- **3D models, textures, ghost sprites and every sound are generated procedurally in code** by this project (`tether-deck/src/assets/models.ts`, `phantom-beam/src/host/textures.ts`, `tetherkit-core/src/feedback/synth.ts`, `phantom-beam/src/audio/*`). The repository contains no third-party images, models, fonts or audio files.
- The UI uses system font stacks only and does not download web fonts.
- Favicons (`*/public/favicon.svg`) are original artwork made for this project.

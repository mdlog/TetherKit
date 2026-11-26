---
inclusion: fileMatch
fileMatchPattern: "tetherkit-core/src/{protocol,transport}/**"
---

# TetherProtocol contract rules

- Source of truth: `.kiro/specs/tether-protocol/requirements.md` and `design.md`. Change the spec first, then the types.
- Messages carry `v: 1`. Sensor frames use the compact tuple `[1,"s",seq,ts,src,nx,ny,roll,held]`. Every other message is a JSON object.
- Channels: `sensor` is `{ ordered: false, maxRetransmits: 0 }` and carries only `SensorFrame`. `control` is ordered and reliable and carries everything else.
- Any transport (WebRTC, WS relay, BroadcastChannel) must carry the **exact same strings**. Transports never look inside payloads.
- `decodeMessage` must never throw, must reject anything over 4096 characters, and must clamp all numeric fields. Every new field needs a validator branch plus a property in `tests/protocol.pbt.test.ts`.
- A controller session starts with `hello`, and the host replies `ack`. The host resets `FrameOrderGuard` on every `hello`.
- Relay wire types live in `transport/signal-types.ts`. That file must stay DOM-free because the Node relay imports it.

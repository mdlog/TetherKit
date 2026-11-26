### Kiroween 2026 · Skeleton Crew
# TetherKit
> Your phone is the controller. No install, no camera, no app store.
- Scan the QR code and the phone streams motion at **60 Hz**
- Gyro, multi-touch, haptics and audio, straight from the browser
- No phone at hand? The **Virtual Phone** runs in split view
Note: Welcome! Hold the big button on your phone to show the laser. Swipe or tap Next to advance. Point at the "60 Hz" to show how steady the laser is.

---

### Connectivity
# How the link works
- The QR code carries a 6-character room code and a one-time token
- Signaling over WSS, then a **peer-to-peer WebRTC** link
- Two DataChannels: `sensor` is unordered, `control` is reliable
- No P2P after 4 seconds? Automatic **WebSocket relay** fallback
Note: The unordered sensor channel avoids head-of-line blocking: a lost frame never delays newer ones. Stale frames are dropped by sequence number.

---

### Sensor pipeline
# From wrist to pixels
- DeviceOrientation → pointing vector, so no gimbal flips at steep tilts
- **Recenter** stores your comfortable pose as zero
- EMA smoothing (α 0.35) plus a micro-deadzone against hand tremor
- Touch trackpad fallback for in-app browsers or denied permission
Note: Press Recenter on the phone now. The laser jumps to the middle of the slide. Then turn your wrist slowly to show the smoothing.

---

### Built with Kiro
# Spec-driven skeleton
- Requirements in **EARS**, then design, then tasks in `.kiro/specs`
- Steering docs encode browser sensor & haptics safety rules
- Agent hooks run the **fast-check** property tests on every save
- Properties guard angle wrapping, the wire codec and frame ordering
Note: Mention that the protocol types, the relay and both apps all come from the same spec. Open the .kiro folder in the repo if there is time.

---

### One skeleton · two apps
# Fork it, tether it
- **tether-deck** · presenter remote, laser and 3D inspector
- **phantom-beam** · a haunted corridor where your phone is the EMF flashlight
- `tetherkit-core` stays under 25 KB gzipped
```
const { host } = useTetherHost({ app: 'my-app' });
host.getLatestFrame(); // { nx, ny, roll, primaryHeld }
```
Note: Switch to phantom-beam for the spooky part. Thank the audience and show the repository URL.

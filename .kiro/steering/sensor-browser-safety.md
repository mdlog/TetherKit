---
inclusion: fileMatch
fileMatchPattern: "tetherkit-core/src/{sensors,feedback}/**"
---

# Browser sensor & haptics safety rules

These rules come from real browser constraints. Breaking any of them causes silent failures on phones.

1. Call `DeviceOrientationEvent.requestPermission()` **synchronously inside the user's tap handler**. Do not call it after an `await`, inside `useEffect`, or in `setTimeout`, because iOS rejects it there. Use `requestOrientationPermission()` from `sensors/environment.ts` and call it first in the handler (see `TetherController.connectFromGesture`).
2. Always keep the **Touch Trackpad fallback** reachable. Use it when permission is denied, when no `deviceorientation` data arrives within 1.5 s, when the page is not a secure context, or when the page runs in an in-app browser / WKWebView (FB, Instagram, LINE, WeChat, WhatsApp, X, TikTok, Telegram, Google app).
3. Never call `navigator.vibrate()` directly. Go through `FeedbackDispatcher`. It sanitizes patterns (≤ 10 entries, each 0–1000 ms, total ≤ 10 000 ms), checks support and user activation, and falls back to a Web Audio tick plus an edge-glow pulse on iOS and Firefox, which have no Vibration API.
4. Create and resume `AudioContext` in a user gesture (`feedback.unlock()`). The Split-View emulator unlocks it on the first pointerdown inside the iframe.
5. Wrap `navigator.wakeLock.request('screen')` in try/catch and re-acquire it on `visibilitychange` → `visible`. The browser releases it on every tab switch.
6. Use direction vectors, not raw Euler angles, for pointing (`orientationToPose`). Wrap every angular delta with `wrapDeltaDegrees` so crossing 359° → 0° never jumps.
7. All sensor outputs must be finite and clamped to [-1, 1]. The property tests in `tests/sensor-math.pbt.test.ts` enforce this. Run `pnpm test:pbt` after any change here.
8. Everything here needs **HTTPS**. Dev servers use `@vitejs/plugin-basic-ssl`, and the signaling socket is proxied on the same origin.

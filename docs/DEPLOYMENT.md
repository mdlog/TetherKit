# Deployment

The Devpost "Working App URL" needs to be public **HTTPS**, because phones block motion sensors and Wake Lock on plain HTTP. There are three deployables:

| Piece | Where | Notes |
| --- | --- | --- |
| `signaling-relay` | Fly.io (or Railway / Render / any Docker host) | Needs WebSockets. Rooms are in memory, so run **exactly one instance** |
| `tether-deck` | Vercel or Cloudflare Pages | Static Vite build; `/control` rewrite included |
| `phantom-beam` | Vercel or Cloudflare Pages | Same as above |

## 1. Relay on Fly.io

```bash
# from the repository root (the Dockerfile needs tetherkit-core's wire types)
fly launch --no-deploy --copy-config --config signaling-relay/fly.toml --dockerfile signaling-relay/Dockerfile
fly deploy --config signaling-relay/fly.toml --dockerfile signaling-relay/Dockerfile
fly scale count 1
curl https://<your-relay>.fly.dev/healthz     # {"ok":true,...}
```

Environment variables (all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8787 (8080 in Docker) | Listen port |
| `SIGNAL_PATH` | `/tether-signal` | WebSocket path (`/` also works) |
| `ALLOWED_ORIGINS` | *(any)* | Comma-separated app origins. **Set this in production.** |
| `TRUST_PROXY` | off (`1` in fly.toml) | Use `Fly-Client-IP` / `X-Forwarded-For` for rate limits |
| `MAX_ROOMS` | 200 | Active room cap |
| `ROOM_TTL_MIN` | 15 | Inactivity TTL |
| `RATE_CONNECTIONS_PER_MIN` | 30 | New sockets per IP per minute |
| `RATE_ROOM_OPS_PER_MIN` | 30 | `register_host` / `join_room` per IP per minute |

Generic Docker: `docker build -f signaling-relay/Dockerfile -t tetherkit-relay . && docker run -p 8080:8080 tetherkit-relay`.

## 2. Apps on Vercel

Create **two Vercel projects** from the same GitHub repo:

| Project | Root Directory | Env vars |
| --- | --- | --- |
| tether-deck | `tether-deck` | `VITE_SIGNALING_URL=wss://<relay>/tether-signal`, `VITE_SIBLING_URL=https://<phantom-beam-url>/` |
| phantom-beam | `phantom-beam` | `VITE_SIGNALING_URL=wss://<relay>/tether-signal`, `VITE_SIBLING_URL=https://<tether-deck-url>/` |

Keep "Include source files outside of the Root Directory" enabled (the default), because both apps import `tetherkit-core` from the workspace. Vercel detects pnpm and Vite. Each `vercel.json` adds the `/control` rewrite, a `Permissions-Policy` for sensors and `Referrer-Policy: no-referrer`, which keeps the room token out of referrers.

Then set `ALLOWED_ORIGINS=https://<tether-deck-url>,https://<phantom-beam-url>` on the relay and redeploy it.

### Cloudflare Pages alternative
Build command `pnpm --filter <app> build`, output directory `<app>/dist`, and the same env vars. `public/_redirects` already maps `/control` to `index.html`.

## 3. Smoke test (incognito, ~2 minutes)

1. Open each app URL in an incognito window. A room code should appear within a second and the signaling dot should turn green.
2. Click **Try Virtual Phone (Split-View)**. The HUD shows `EMULATOR`. Drag the pad, hold Space, change slides, and play one phantom-beam hunt.
3. Scan the QR code with a phone on mobile data (not Wi-Fi). Expect `P2P`, or `RELAY` after about 4 s on strict NATs.
4. iPhone: the **Connect & Enable Sensors** button must show the motion permission prompt. With it denied, the touch trackpad must still work.
5. Open the QR link from inside WhatsApp or Instagram. The in-app browser banner must appear and the touch trackpad must work.

## Optional: TURN

Some corporate networks block UDP entirely. The relay fallback already covers them. If you also want P2P there, add a TURN server: `VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turns:turn.example.com:443","username":"u","credential":"p"}]`. Remember that `VITE_*` values are public, so use short-lived TURN credentials.

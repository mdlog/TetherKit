/** Public STUN only; add TURN servers through `iceServers` for strict networks. */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** WebRTC must open within this window before we fall back to the WebSocket relay. */
export const DEFAULT_P2P_TIMEOUT_MS = 4000;

export const DEFAULT_SIGNALING_PATH = '/tether-signal';

/**
 * Explicit URL wins; otherwise use the same origin (the Vite dev server proxies
 * `/tether-signal` to the local relay, so phones only need to trust one cert).
 */
export function resolveSignalingUrl(explicit?: string | null): string {
  if (explicit) return explicit;
  if (typeof location === 'undefined') return `ws://localhost:8787${DEFAULT_SIGNALING_PATH}`;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${DEFAULT_SIGNALING_PATH}`;
}

/** Controller page served by the same app at `/control`. */
export function defaultControllerUrl(origin?: string | null): string {
  const base = origin || (typeof location === 'undefined' ? '' : location.origin);
  return `${base.replace(/\/$/, '')}/control`;
}

export function buildJoinUrl(controllerUrl: string, roomId: string, token: string): string {
  const url = new URL(controllerUrl, typeof location === 'undefined' ? 'https://localhost' : location.href);
  url.searchParams.set('room', roomId);
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildEmulatorUrl(controllerUrl: string, channelId: string): string {
  const url = new URL(controllerUrl, typeof location === 'undefined' ? 'https://localhost' : location.href);
  url.searchParams.set('emu', channelId);
  return url.toString();
}

/** Parses a JSON array of RTCIceServer (e.g. from an env variable). Invalid input -> undefined. */
export function parseIceServers(json?: string | null): RTCIceServer[] | undefined {
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'object' && s !== null && 'urls' in s)) {
      return parsed as RTCIceServer[];
    }
  } catch {
    /* fall through */
  }
  console.warn('[tetherkit] Ignoring invalid ICE server config');
  return undefined;
}

/** True when a phone could not reach this host name (QR would be useless). */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.');
}

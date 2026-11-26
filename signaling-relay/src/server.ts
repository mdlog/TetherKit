import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  RELAY_FRAME_MAX_CHARS,
  isValidRoomCode,
  type ServerToClient,
  type SignalErrorCode,
} from 'tetherkit-core/signal';
import { SlidingWindowLimiter, TokenBucket } from './rate-limiter';
import { RoomManager, type Peer } from './room-manager';

// ---- configuration (env) ---------------------------------------------------
const env = process.env;
const PORT = Number(env.PORT ?? 8787);
const SIGNAL_PATH = env.SIGNAL_PATH ?? '/tether-signal';
const TRUST_PROXY = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const MAX_ROOMS = Number(env.MAX_ROOMS ?? 200);
const ROOM_TTL_MS = Number(env.ROOM_TTL_MIN ?? 15) * 60_000;
const CONNECTIONS_PER_MIN = Number(env.RATE_CONNECTIONS_PER_MIN ?? 30);
const ROOM_OPS_PER_MIN = Number(env.RATE_ROOM_OPS_PER_MIN ?? 30);
const SIGNALS_PER_MIN = 300; // SDP + ICE forwarding, per connection
const MAX_SIGNAL_CHARS = 12 * 1024;

const rooms = new RoomManager({ ttlMs: ROOM_TTL_MS, maxRooms: MAX_ROOMS });
const connectionLimiter = new SlidingWindowLimiter(CONNECTIONS_PER_MIN, 60_000);
const roomOpLimiter = new SlidingWindowLimiter(ROOM_OPS_PER_MIN, 60_000);

interface Connection {
  ws: WebSocket;
  peer: Peer;
  alive: boolean;
  bucket: TokenBucket;
  signals: SlidingWindowLimiter;
  lastRateError: number;
}
const connections = new Set<Connection>();

function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const fly = req.headers['fly-client-ip'];
    if (typeof fly === 'string' && fly) return fly;
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function reject(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

// ---- HTTP (health check) -------------------------------------------------
const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, connections: connections.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`TetherKit signaling relay. Connect with WebSocket at ${SIGNAL_PATH}\n`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', 'http://relay.local');
  if (pathname !== SIGNAL_PATH && pathname !== '/') return reject(socket, 404, 'Not Found');
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length > 0 && (!origin || !ALLOWED_ORIGINS.includes(origin))) {
    return reject(socket, 403, 'Forbidden');
  }
  const ip = clientIp(req);
  if (!connectionLimiter.hit(ip)) return reject(socket, 429, 'Too Many Requests');
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
});

// ---- WebSocket protocol --------------------------------------------------
function onConnection(ws: WebSocket, ip: string): void {
  const peer: Peer = {
    id: randomUUID(),
    ip,
    role: null,
    roomId: null,
    send: (message: ServerToClient) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
    close: (code, reason) => ws.close(code, reason),
  };
  const conn: Connection = {
    ws,
    peer,
    alive: true,
    // 60 Hz sensor relay + control traffic fits comfortably; bursts allowed.
    bucket: new TokenBucket(120, 240),
    signals: new SlidingWindowLimiter(SIGNALS_PER_MIN, 60_000),
    lastRateError: 0,
  };
  connections.add(conn);

  const fail = (code: SignalErrorCode, message: string) => peer.send({ t: 'error', code, message });

  ws.on('pong', () => {
    conn.alive = true;
  });
  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (!conn.bucket.take()) {
      const now = Date.now();
      if (now - conn.lastRateError > 1000) {
        conn.lastRateError = now;
        fail('RATE_LIMITED', 'Too many messages.');
      }
      return;
    }
    if (isBinary) return fail('BAD_MESSAGE', 'Binary frames are not supported.');
    handleMessage(conn, data.toString(), fail);
  });
  ws.on('close', () => {
    rooms.leave(peer);
    connections.delete(conn);
  });
  ws.on('error', () => {
    /* close follows */
  });
}

type Fail = (code: SignalErrorCode, message: string) => void;

function handleMessage(conn: Connection, text: string, fail: Fail): void {
  const { peer } = conn;
  let msg: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    msg = parsed as Record<string, unknown>;
  } catch {
    return fail('BAD_MESSAGE', 'Messages must be JSON objects.');
  }

  switch (msg.t) {
    case 'ping':
      peer.send({ t: 'pong' });
      return;

    case 'register_host': {
      if (!roomOpLimiter.hit(peer.ip)) return fail('RATE_LIMITED', 'Too many room requests. Wait a minute.');
      const app = typeof msg.app === 'string' && /^[\w.-]{1,64}$/.test(msg.app) ? msg.app : 'app';
      const resume = msg.resume as { roomId?: unknown; token?: unknown } | undefined;
      const validResume =
        resume && isValidRoomCode(resume.roomId) && typeof resume.token === 'string'
          ? { roomId: resume.roomId, token: resume.token }
          : undefined;
      const result = rooms.registerHost(peer, app, validResume);
      if (!result.ok) return fail(result.code, result.message);
      peer.send({
        t: 'room_created',
        roomId: result.roomId,
        token: result.token,
        app: result.app,
        resumed: result.resumed,
        ttlSec: rooms.ttlSeconds,
      });
      if (result.controllerPresent) rooms.announceReady(peer);
      return;
    }

    case 'join_room': {
      if (!roomOpLimiter.hit(peer.ip)) return fail('RATE_LIMITED', 'Too many room requests. Wait a minute.');
      if (!isValidRoomCode(msg.roomId)) return fail('ROOM_NOT_FOUND', 'Invalid room code.');
      const token = typeof msg.token === 'string' ? msg.token : undefined;
      const result = rooms.joinRoom(peer, msg.roomId, token);
      if (!result.ok) fail(result.code, result.message);
      return;
    }

    case 'signal_offer':
    case 'signal_answer':
    case 'signal_ice': {
      if (!peer.roomId) return fail('NOT_IN_ROOM', 'Join a room first.');
      if (!conn.signals.hit(peer.id)) return fail('RATE_LIMITED', 'Too many signaling messages.');
      if (text.length > MAX_SIGNAL_CHARS) return fail('PAYLOAD_TOO_LARGE', 'Signal payload too large.');
      rooms.forward(peer, { t: msg.t, data: msg.data });
      return;
    }

    case 'use_relay': {
      if (!peer.roomId) return fail('NOT_IN_ROOM', 'Join a room first.');
      const reason = typeof msg.reason === 'string' ? msg.reason.slice(0, 64) : undefined;
      rooms.forward(peer, reason ? { t: 'use_relay', reason } : { t: 'use_relay' });
      return;
    }

    case 'relay_frame': {
      if (!peer.roomId) return fail('NOT_IN_ROOM', 'Join a room first.');
      if (msg.ch !== 'sensor' && msg.ch !== 'control') return fail('BAD_MESSAGE', 'Unknown channel.');
      if (typeof msg.d !== 'string') return fail('BAD_MESSAGE', 'Frame payload must be a string.');
      if (msg.d.length > RELAY_FRAME_MAX_CHARS) return fail('PAYLOAD_TOO_LARGE', 'Relay frames are limited to 4 KB.');
      rooms.forward(peer, { t: 'relay_frame', ch: msg.ch, d: msg.d });
      return;
    }

    default:
      return fail('BAD_MESSAGE', 'Unknown message type.');
  }
}

// ---- housekeeping ----------------------------------------------------------
const heartbeat = setInterval(() => {
  for (const conn of connections) {
    if (!conn.alive) {
      conn.ws.terminate();
      continue;
    }
    conn.alive = false;
    conn.ws.ping();
  }
}, 30_000);

const sweeper = setInterval(() => {
  rooms.sweep();
  connectionLimiter.prune();
  roomOpLimiter.prune();
}, 15_000);

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}${SIGNAL_PATH} (max ${MAX_ROOMS} rooms, TTL ${ROOM_TTL_MS / 60_000} min)`);
});

function shutdown(): void {
  clearInterval(heartbeat);
  clearInterval(sweeper);
  for (const conn of connections) conn.ws.close(1001, 'server-shutdown');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

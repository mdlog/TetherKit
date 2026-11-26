import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type PeerRole,
  type ServerToClient,
  type SignalErrorCode,
} from 'tetherkit-core/signal';

export interface Peer {
  readonly id: string;
  readonly ip: string;
  role: PeerRole | null;
  roomId: string | null;
  send(message: ServerToClient): void;
  close(code: number, reason: string): void;
}

interface Room {
  id: string;
  app: string;
  tokenHash: Buffer;
  host: Peer | null;
  controller: Peer | null;
  /** Inactivity deadline (refreshed by any message in the room). */
  expiresAt: number;
  /** When the host socket dropped; the room is kept for `hostGraceMs` so a reload can resume it. */
  hostGoneAt: number | null;
}

export interface RoomManagerOptions {
  ttlMs?: number;
  hostGraceMs?: number;
  maxRooms?: number;
  now?: () => number;
}

export type RoomResult =
  | { ok: true; roomId: string; token: string; app: string; resumed: boolean; controllerPresent: boolean }
  | { ok: false; code: SignalErrorCode; message: string };

export type JoinResult = { ok: true } | { ok: false; code: SignalErrorCode; message: string };

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/**
 * In-memory room registry: one host + at most one controller per room.
 * No sensor data is stored; rooms expire after 15 minutes of inactivity.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly ttlMs: number;
  private readonly hostGraceMs: number;
  private readonly maxRooms: number;
  private readonly now: () => number;

  constructor(options: RoomManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? 15 * 60_000;
    this.hostGraceMs = options.hostGraceMs ?? 30_000;
    this.maxRooms = options.maxRooms ?? 200;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.rooms.size;
  }

  registerHost(peer: Peer, app: string, resume?: { roomId: string; token: string }): RoomResult {
    this.leave(peer);
    const existing = resume ? this.rooms.get(resume.roomId) : undefined;
    if (resume && existing && this.tokenMatches(existing, resume.token)) {
      if (existing.host && existing.host !== peer) {
        const old = existing.host;
        old.roomId = null;
        old.send({ t: 'error', code: 'REPLACED', message: 'This room was reopened in another tab.' });
        old.close(4001, 'replaced');
      }
      existing.host = peer;
      existing.hostGoneAt = null;
      peer.role = 'host';
      peer.roomId = existing.id;
      this.touch(existing);
      return {
        ok: true,
        roomId: existing.id,
        token: resume.token,
        app: existing.app,
        resumed: true,
        controllerPresent: existing.controller !== null,
      };
    }

    if (this.rooms.size >= this.maxRooms) this.sweep();
    if (this.rooms.size >= this.maxRooms) {
      return { ok: false, code: 'TOO_MANY_ROOMS', message: 'The relay is at capacity. Try again in a minute.' };
    }
    let id = this.generateCode();
    while (this.rooms.has(id)) id = this.generateCode();
    const token = randomBytes(18).toString('base64url');
    const room: Room = {
      id,
      app,
      tokenHash: hashToken(token),
      host: peer,
      controller: null,
      expiresAt: this.now() + this.ttlMs,
      hostGoneAt: null,
    };
    this.rooms.set(id, room);
    peer.role = 'host';
    peer.roomId = id;
    return { ok: true, roomId: id, token, app, resumed: false, controllerPresent: false };
  }

  /** Tells both peers of the sender's room to (re)negotiate. */
  announceReady(peer: Peer): void {
    const room = peer.roomId ? this.rooms.get(peer.roomId) : undefined;
    if (!room?.host || !room.controller) return;
    room.host.send({ t: 'peer_ready' });
    room.controller.send({ t: 'peer_ready' });
  }

  get ttlSeconds(): number {
    return this.ttlMs / 1000;
  }

  joinRoom(peer: Peer, roomId: string, token?: string): JoinResult {
    this.leave(peer);
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found or expired.' };

    if (token !== undefined) {
      if (!this.tokenMatches(room, token)) return { ok: false, code: 'BAD_TOKEN', message: 'Invalid room token.' };
      // A valid token may take over the slot (e.g. the phone reloaded the page).
      if (room.controller && room.controller !== peer) {
        const old = room.controller;
        old.roomId = null;
        old.send({ t: 'error', code: 'REPLACED', message: 'This room was opened on another device.' });
        old.close(4001, 'replaced');
        room.controller = null;
      }
    } else if (room.controller) {
      return { ok: false, code: 'ROOM_FULL', message: 'A controller is already connected.' };
    }

    room.controller = peer;
    peer.role = 'controller';
    peer.roomId = room.id;
    this.touch(room);
    peer.send({ t: 'joined', roomId: room.id, app: room.app });
    if (room.host) {
      room.host.send({ t: 'peer_ready' });
      peer.send({ t: 'peer_ready' });
    } else {
      peer.send({ t: 'peer_left', role: 'host' });
    }
    return { ok: true };
  }

  /** Sends a message to the other peer in the sender's room. */
  forward(peer: Peer, message: ServerToClient): boolean {
    const room = peer.roomId ? this.rooms.get(peer.roomId) : undefined;
    if (!room) return false;
    const other = peer.role === 'host' ? room.controller : room.host;
    this.touch(room);
    if (!other) return false;
    other.send(message);
    return true;
  }

  leave(peer: Peer): void {
    const room = peer.roomId ? this.rooms.get(peer.roomId) : undefined;
    peer.roomId = null;
    if (!room) return;
    if (room.host === peer) {
      room.host = null;
      room.hostGoneAt = this.now();
      room.controller?.send({ t: 'peer_left', role: 'host' });
    } else if (room.controller === peer) {
      room.controller = null;
      room.host?.send({ t: 'peer_left', role: 'controller' });
    }
  }

  /** Removes expired rooms. Returns how many were removed. */
  sweep(): number {
    const t = this.now();
    let removed = 0;
    for (const [id, room] of this.rooms) {
      const idle = t > room.expiresAt;
      const abandoned = room.host === null && room.hostGoneAt !== null && t - room.hostGoneAt > this.hostGraceMs;
      if (!idle && !abandoned) continue;
      for (const peer of [room.host, room.controller]) {
        if (!peer) continue;
        peer.roomId = null;
        peer.send({ t: 'error', code: 'ROOM_EXPIRED', message: 'Room expired.' });
        peer.close(4000, 'room-expired');
      }
      this.rooms.delete(id);
      removed++;
    }
    return removed;
  }

  private touch(room: Room): void {
    room.expiresAt = this.now() + this.ttlMs;
  }

  private tokenMatches(room: Room, token: string): boolean {
    if (typeof token !== 'string' || token.length === 0 || token.length > 128) return false;
    return timingSafeEqual(hashToken(token), room.tokenHash);
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    return code;
  }
}

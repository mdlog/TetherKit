/**
 * Wire contract between browsers and the `signaling-relay` server.
 *
 * This file is DOM-free on purpose: the relay imports it as a type-only
 * module (`tetherkit-core/signal`) so both sides share one source of truth.
 * Spec: .kiro/specs/tether-protocol/design.md (section "Signaling contract").
 */

export type PeerRole = 'host' | 'controller';
export type LinkChannel = 'sensor' | 'control';

/** Maximum size (characters) of a `relay_frame` payload. */
export const RELAY_FRAME_MAX_CHARS = 4096;
/** Room codes use an unambiguous alphabet (no I, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export type SignalErrorCode =
  | 'BAD_MESSAGE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'BAD_TOKEN'
  | 'NOT_IN_ROOM'
  | 'RATE_LIMITED'
  | 'TOO_MANY_ROOMS'
  | 'PAYLOAD_TOO_LARGE'
  | 'ROOM_EXPIRED'
  | 'REPLACED';

/** Messages a browser sends to the relay. */
export type ClientToServer =
  | { t: 'register_host'; app: string; resume?: { roomId: string; token: string } }
  | { t: 'join_room'; roomId: string; token?: string }
  | { t: 'signal_offer'; data: unknown }
  | { t: 'signal_answer'; data: unknown }
  | { t: 'signal_ice'; data: unknown }
  | { t: 'use_relay'; reason?: string }
  | { t: 'relay_frame'; ch: LinkChannel; d: string }
  | { t: 'ping' };

/** Messages the relay sends to a browser. */
export type ServerToClient =
  | { t: 'room_created'; roomId: string; token: string; app: string; resumed: boolean; ttlSec: number }
  | { t: 'joined'; roomId: string; app: string }
  | { t: 'peer_ready' }
  | { t: 'peer_left'; role: PeerRole }
  | { t: 'signal_offer'; data: unknown }
  | { t: 'signal_answer'; data: unknown }
  | { t: 'signal_ice'; data: unknown }
  | { t: 'use_relay'; reason?: string }
  | { t: 'relay_frame'; ch: LinkChannel; d: string }
  | { t: 'pong' }
  | { t: 'error'; code: SignalErrorCode; message: string };

export function isValidRoomCode(code: unknown): code is string {
  if (typeof code !== 'string' || code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Uppercases and strips separators so "ab12-cd" style input still matches. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

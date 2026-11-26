import {
  DEFAULT_ICE_SERVERS,
  DEFAULT_P2P_TIMEOUT_MS,
  buildEmulatorUrl,
  buildJoinUrl,
  defaultControllerUrl,
  resolveSignalingUrl,
} from './config';
import { sanitizeVibrationPattern } from './feedback/vibration';
import { decodeMessage, encodeMessage } from './protocol/codec';
import { FrameOrderGuard } from './protocol/seq-guard';
import {
  channelFor,
  type ControlAction,
  type DeviceInfo,
  type FeedbackEvent,
  type FeedbackInput,
  type SensorFrame,
  type StatusMessage,
  type TetherMessage,
  type TransportMode,
} from './protocol/types';
import { BroadcastLink, isBroadcastSupported } from './transport/broadcast-link';
import { RtcSession, isWebRtcSupported } from './transport/rtc-session';
import type { LinkChannel, ServerToClient } from './transport/signal-types';
import { SignalingClient } from './transport/signaling-client';
import { Emitter, Store } from './util/emitter';
import { randomId } from './util/ids';

export type HostStatus = 'idle' | 'connecting' | 'waiting' | 'negotiating' | 'connected' | 'offline' | 'error';

export interface HostState {
  status: HostStatus;
  /** Transport of the active controller link. */
  transport: TransportMode | null;
  roomId: string | null;
  /** URL encoded in the QR code. */
  joinUrl: string | null;
  signalingOnline: boolean;
  /** Set while the Split-View emulator is open. */
  emulatorUrl: string | null;
  latencyMs: number | null;
  sensorHz: number;
  device: DeviceInfo | null;
  controllerStatus: StatusMessage | null;
  error: string | null;
}

export interface TetherHostOptions {
  /** App id, echoed to the controller (e.g. "tether-deck"). */
  app: string;
  signalingUrl?: string | null;
  /** Base URL of the controller page. Default: `${location.origin}/control`. */
  controllerUrl?: string | null;
  iceServers?: RTCIceServer[];
  p2pTimeoutMs?: number;
  /** Keep the room in sessionStorage so reloads keep the same QR. Default true. */
  persistRoom?: boolean;
}

type HostEvents = {
  frame: [SensorFrame];
  action: [ControlAction];
  connect: [TransportMode];
  disconnect: [];
};

type Source = 'remote' | 'emulator';

/** A controller that stops sending (frames, pongs, status) for this long is inactive. */
const STALE_AFTER_MS = 6000;

function zeroFrame(): SensorFrame {
  return { v: 1, type: 'sensor', seq: -1, ts: 0, inputSource: 'touch', nx: 0, ny: 0, roll: 0, primaryHeld: false };
}

/**
 * Desktop side of TetherKit. Owns the signaling connection, negotiates WebRTC
 * (falling back to the WebSocket relay after `p2pTimeoutMs`), runs the
 * BroadcastChannel emulator link, and exposes the latest sensor frame.
 *
 * Sensor frames never go through React state: read `getLatestFrame()` from a
 * render loop or subscribe with `onFrame`.
 */
export class TetherHost {
  readonly options: Required<Omit<TetherHostOptions, 'signalingUrl' | 'controllerUrl'>> & {
    signalingUrl: string;
    controllerUrl: string;
  };
  private readonly store: Store<HostState>;
  private readonly events = new Emitter<HostEvents>();
  private readonly guard = new FrameOrderGuard();
  private latest: SensorFrame = zeroFrame();

  private started = false;
  private signal: SignalingClient | null = null;
  private rtc: RtcSession | null = null;
  private relay = false;
  private p2pTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private room: { roomId: string; token: string } | null = null;

  private emu: BroadcastLink | null = null;
  private readonly sources: Record<Source, { hello: boolean; lastSeen: number }> = {
    remote: { hello: false, lastSeen: 0 },
    emulator: { hello: false, lastSeen: 0 },
  };
  private active: Source | null = null;
  private pingId = 0;
  private framesThisSecond = 0;

  constructor(options: TetherHostOptions) {
    this.options = {
      app: options.app,
      signalingUrl: resolveSignalingUrl(options.signalingUrl),
      controllerUrl: options.controllerUrl || defaultControllerUrl(),
      iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS,
      p2pTimeoutMs: options.p2pTimeoutMs ?? DEFAULT_P2P_TIMEOUT_MS,
      persistRoom: options.persistRoom ?? true,
    };
    this.store = new Store<HostState>({
      status: 'idle',
      transport: null,
      roomId: null,
      joinUrl: null,
      signalingOnline: false,
      emulatorUrl: null,
      latencyMs: null,
      sensorHz: 0,
      device: null,
      controllerStatus: null,
      error: null,
    });
  }

  // ---- public API --------------------------------------------------------

  getState = (): HostState => this.store.get();
  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  /** Latest accepted sensor frame (seq -1 until a controller sends one). */
  getLatestFrame(): SensorFrame {
    return this.latest;
  }

  get isConnected(): boolean {
    return this.active !== null;
  }

  onFrame(handler: (frame: SensorFrame) => void): () => void {
    return this.events.on('frame', handler);
  }

  onAction(handler: (action: ControlAction) => void): () => void {
    return this.events.on('action', handler);
  }

  /** Fires whenever a controller becomes active (send your full sync state here). */
  onConnect(handler: (transport: TransportMode) => void): () => void {
    return this.events.on('connect', handler);
  }

  onDisconnect(handler: () => void): () => void {
    return this.events.on('disconnect', handler);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.store.set({ status: 'connecting', error: null });
    this.connectSignaling();
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.tickTimer = this.reconnectTimer = null;
    this.teardownRemote();
    this.signal?.close();
    this.signal = null;
    this.stopEmulator();
    this.store.set({ status: 'idle', signalingOnline: false, transport: null });
  }

  /** Opens the BroadcastChannel loopback and returns the iframe URL for the virtual phone. */
  startEmulator(): string | null {
    if (!isBroadcastSupported()) {
      this.store.set({ error: 'This browser does not support BroadcastChannel (needed for the emulator).' });
      return null;
    }
    if (!this.emu) {
      const channelId = randomId(10);
      this.emu = new BroadcastLink(channelId, 'host', (ch, data) => this.handleIncoming('emulator', ch, data));
      this.store.set({ emulatorUrl: buildEmulatorUrl(this.options.controllerUrl, channelId) });
    }
    return this.store.get().emulatorUrl;
  }

  stopEmulator(): void {
    if (!this.emu) return;
    this.emu.close();
    this.emu = null;
    this.sources.emulator.hello = false;
    this.store.set({ emulatorUrl: null });
    if (this.active === 'emulator') this.deactivate();
  }

  /** Send feedback / sync state to the active controller over the reliable channel. */
  sendFeedback(input: FeedbackInput): boolean {
    const event: FeedbackEvent = { v: 1, type: 'feedback', ...input };
    if (input.vibratePattern) event.vibratePattern = sanitizeVibrationPattern(input.vibratePattern);
    return this.sendMessage(event);
  }

  // ---- signaling ---------------------------------------------------------

  private storageKey(): string {
    return `tetherkit:${this.options.app}:room`;
  }

  private loadRoom(): { roomId: string; token: string } | null {
    if (!this.options.persistRoom || typeof sessionStorage === 'undefined') return this.room;
    try {
      const raw = sessionStorage.getItem(this.storageKey());
      const parsed = raw ? (JSON.parse(raw) as { roomId?: unknown; token?: unknown }) : null;
      if (parsed && typeof parsed.roomId === 'string' && typeof parsed.token === 'string') {
        return { roomId: parsed.roomId, token: parsed.token };
      }
    } catch {
      /* storage blocked */
    }
    return this.room;
  }

  private saveRoom(room: { roomId: string; token: string }): void {
    this.room = room;
    if (!this.options.persistRoom || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(this.storageKey(), JSON.stringify(room));
    } catch {
      /* storage blocked */
    }
  }

  private connectSignaling(): void {
    const client = new SignalingClient(this.options.signalingUrl, {
      onOpen: () => {
        this.reconnectDelay = 1000;
        this.store.set({ signalingOnline: true });
        const resume = this.loadRoom();
        client.send({ t: 'register_host', app: this.options.app, ...(resume ? { resume } : {}) });
      },
      onMessage: (message) => this.handleSignal(message),
      onClose: () => {
        this.signal = null;
        this.store.set({ signalingOnline: false });
        // Relay traffic dies with the socket; a P2P link survives on its own.
        if (this.relay) this.teardownRemote();
        if (!this.active) this.store.set({ status: 'offline' });
        this.scheduleReconnect();
      },
    });
    this.signal = client;
    client.connect();
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.started && !this.signal) this.connectSignaling();
    }, delay);
  }

  private handleSignal(message: ServerToClient): void {
    switch (message.t) {
      case 'room_created': {
        this.saveRoom({ roomId: message.roomId, token: message.token });
        this.store.set({
          roomId: message.roomId,
          joinUrl: buildJoinUrl(this.options.controllerUrl, message.roomId, message.token),
          error: null,
          status: this.active ? 'connected' : 'waiting',
        });
        break;
      }
      case 'peer_ready':
        this.beginNegotiation();
        break;
      case 'signal_answer':
        void this.rtc?.handleSignal('answer', message.data);
        break;
      case 'signal_ice':
        void this.rtc?.handleSignal('ice', message.data);
        break;
      case 'use_relay':
        this.activateRelay(false, message.reason ?? 'peer-request');
        break;
      case 'relay_frame':
        if (!this.relay) this.activateRelay(false, 'peer-relay-traffic');
        this.handleIncoming('remote', message.ch, message.d);
        break;
      case 'peer_left':
        if (message.role === 'controller') {
          this.teardownRemote();
          if (!this.active) this.store.set({ status: 'waiting' });
        }
        break;
      case 'error':
        this.store.set({ error: `${message.code}: ${message.message}` });
        if (message.code === 'TOO_MANY_ROOMS' || message.code === 'RATE_LIMITED') {
          this.store.set({ status: this.active ? 'connected' : 'error' });
          this.signal?.close();
          this.signal = null;
          this.store.set({ signalingOnline: false });
          this.reconnectDelay = Math.max(this.reconnectDelay, 5000);
          this.scheduleReconnect();
        }
        break;
      default:
        break;
    }
  }

  private beginNegotiation(): void {
    this.teardownRemote();
    if (!this.active) this.store.set({ status: 'negotiating' });
    if (!isWebRtcSupported()) {
      this.activateRelay(true, 'webrtc-unsupported');
      return;
    }
    const session = new RtcSession({
      role: 'offerer',
      iceServers: this.options.iceServers,
      sendSignal: (kind, data) =>
        this.signal?.send({ t: kind === 'offer' ? 'signal_offer' : kind === 'answer' ? 'signal_answer' : 'signal_ice', data }),
      onOpen: () => {
        if (this.p2pTimer) clearTimeout(this.p2pTimer);
        this.p2pTimer = null;
        if (this.relay) {
          // We already committed to the relay for this session; keep it simple.
          session.close();
          if (this.rtc === session) this.rtc = null;
        }
      },
      onMessage: (ch, data) => {
        if (!this.relay) this.handleIncoming('remote', ch, data);
      },
      onFailed: (reason) => {
        if (this.rtc === session) this.activateRelay(true, reason);
      },
    });
    this.rtc = session;
    session.start().catch((error) => {
      console.warn('[tetherkit] Could not create WebRTC offer', error);
      this.activateRelay(true, 'offer-failed');
    });
    this.p2pTimer = setTimeout(() => {
      this.p2pTimer = null;
      if (this.rtc === session && !session.isOpen) this.activateRelay(true, 'p2p-timeout');
    }, this.options.p2pTimeoutMs);
  }

  private activateRelay(notifyPeer: boolean, reason: string): void {
    if (this.p2pTimer) clearTimeout(this.p2pTimer);
    this.p2pTimer = null;
    if (this.rtc) {
      this.rtc.close();
      this.rtc = null;
    }
    if (this.relay) return;
    this.relay = true;
    if (notifyPeer) this.signal?.send({ t: 'use_relay', reason });
    if (this.active === 'remote') this.store.set({ transport: 'ws-relay' });
  }

  /** Forget the phone link (WebRTC + relay). The emulator link is unaffected. */
  private teardownRemote(): void {
    if (this.p2pTimer) clearTimeout(this.p2pTimer);
    this.p2pTimer = null;
    this.rtc?.close();
    this.rtc = null;
    this.relay = false;
    this.sources.remote.hello = false;
    if (this.active === 'remote') this.deactivate();
  }

  // ---- link handling -----------------------------------------------------

  private sendOn(source: Source, channel: LinkChannel, data: string): boolean {
    if (source === 'emulator') return this.emu?.send(channel, data) ?? false;
    if (this.relay) {
      if (!this.signal) return false;
      if (channel === 'sensor' && this.signal.bufferedAmount > 64 * 1024) return false;
      return this.signal.send({ t: 'relay_frame', ch: channel, d: data });
    }
    return this.rtc?.send(channel, data) ?? false;
  }

  private sendMessage(message: TetherMessage, source: Source | null = this.active): boolean {
    if (!source) return false;
    return this.sendOn(source, channelFor(message.type), encodeMessage(message));
  }

  private transportOf(source: Source): TransportMode {
    return source === 'emulator' ? 'local-emulator' : this.relay ? 'ws-relay' : 'p2p';
  }

  private isFresh(source: Source): boolean {
    const s = this.sources[source];
    return s.hello && performance.now() - s.lastSeen < STALE_AFTER_MS;
  }

  private activate(source: Source, newSession: boolean): void {
    if (newSession) this.guard.reset();
    this.active = source;
    const transport = this.transportOf(source);
    this.store.set({ status: 'connected', transport, error: null });
    this.events.emit('connect', transport);
  }

  private deactivate(): void {
    this.active = null;
    this.latest = { ...this.latest, primaryHeld: false };
    // Fall back to another live link if there is one.
    const other: Source | null = this.isFresh('remote') ? 'remote' : this.isFresh('emulator') ? 'emulator' : null;
    if (other) {
      this.activate(other, true);
      return;
    }
    this.store.set({
      status: this.room ? 'waiting' : this.signal ? 'connecting' : 'offline',
      transport: null,
      latencyMs: null,
      sensorHz: 0,
      device: null,
      controllerStatus: null,
    });
    this.events.emit('disconnect');
  }

  private handleIncoming(source: Source, _channel: LinkChannel, raw: string): void {
    const message = decodeMessage(raw);
    if (!message) return;
    const state = this.sources[source];

    if (message.type === 'hello') {
      state.hello = true;
      state.lastSeen = performance.now();
      this.sendMessage({ v: 1, type: 'ack', app: this.options.app, sessionId: message.sessionId }, source);
      this.store.set({ device: message.device });
      this.activate(source, true);
      return;
    }
    if (!state.hello) return;
    state.lastSeen = performance.now();

    if (this.active !== source) {
      if (this.active && this.isFresh(this.active)) return;
      this.activate(source, false);
    }

    switch (message.type) {
      case 'sensor':
        if (this.guard.accept(message.seq)) {
          this.latest = message;
          this.framesThisSecond++;
          this.events.emit('frame', message);
        }
        break;
      case 'action':
        this.events.emit('action', message);
        break;
      case 'pong': {
        const sample = (performance.now() - message.t) / 2;
        if (sample >= 0 && sample < 10_000) {
          const prev = this.store.get().latencyMs;
          const smoothed = prev === null ? sample : prev * 0.7 + sample * 0.3;
          this.store.set({ latencyMs: Math.round(smoothed * 10) / 10 });
        }
        break;
      }
      case 'status':
        this.store.set({ controllerStatus: message });
        break;
      default:
        break;
    }
  }

  private tick(): void {
    this.store.set({ sensorHz: this.framesThisSecond });
    this.framesThisSecond = 0;
    if (this.active && !this.isFresh(this.active)) {
      this.deactivate();
      return;
    }
    if (this.active) {
      this.sendMessage({ v: 1, type: 'ping', id: ++this.pingId, t: performance.now() });
    }
  }
}

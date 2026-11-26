import { DEFAULT_ICE_SERVERS, DEFAULT_P2P_TIMEOUT_MS, resolveSignalingUrl } from './config';
import { FeedbackDispatcher } from './feedback/dispatcher';
import { WakeLockManager } from './feedback/wake-lock';
import { decodeMessage, encodeMessage } from './protocol/codec';
import {
  channelFor,
  type FeedbackEvent,
  type InputSource,
  type TetherMessage,
  type TransportMode,
} from './protocol/types';
import {
  detectEnvironment,
  requestOrientationPermission,
  type BrowserEnvironment,
  type OrientationPermission,
} from './sensors/environment';
import { OrientationSource } from './sensors/orientation-source';
import { SensorPipeline, type NormalizedPose, type PipelineOptions } from './sensors/pipeline';
import { TouchTrackpad, type TrackpadOptions } from './sensors/touch';
import { BroadcastLink } from './transport/broadcast-link';
import { RtcSession, isWebRtcSupported } from './transport/rtc-session';
import {
  isValidRoomCode,
  normalizeRoomCode,
  type LinkChannel,
  type ServerToClient,
  type SignalErrorCode,
} from './transport/signal-types';
import { SignalingClient } from './transport/signaling-client';
import { Emitter, Store } from './util/emitter';
import { randomId } from './util/ids';

export type ControllerStatus =
  | 'idle'
  | 'connecting'
  | 'negotiating'
  | 'connected'
  | 'reconnecting'
  | 'host-left'
  | 'error';

export type ControllerTarget =
  | { kind: 'room'; roomId: string; token?: string }
  | { kind: 'emulator'; channelId: string };

export interface ControllerState {
  status: ControllerStatus;
  transport: TransportMode | null;
  target: ControllerTarget | null;
  /** App id reported by the host (e.g. "phantom-beam"). */
  app: string | null;
  inputSource: InputSource;
  sensorPermission: OrientationPermission | 'unknown';
  calibrated: boolean;
  primaryHeld: boolean;
  wakeLock: boolean;
  error: string | null;
}

export interface TetherControllerOptions {
  signalingUrl?: string | null;
  iceServers?: RTCIceServer[];
  p2pTimeoutMs?: number;
  /** Sensor frame rate. Default 60. */
  sendRateHz?: number;
  /** Re-send an unchanged frame at least this often. Default 250 ms. */
  keepAliveMs?: number;
  pipeline?: PipelineOptions;
  trackpad?: TrackpadOptions;
}

export interface TouchBehavior {
  /** Return the trackpad to centre when the finger lifts (joystick feel). */
  springBack?: boolean;
  /** Treat "finger on pad" as holding the primary button. */
  holdsPrimary?: boolean;
}

type ControllerEvents = {
  feedback: [FeedbackEvent];
  sync: [Record<string, unknown>];
};

const FATAL_ERRORS: Partial<Record<SignalErrorCode, string>> = {
  ROOM_NOT_FOUND: 'Room not found or expired. Check the code on the desktop screen.',
  BAD_TOKEN: 'This QR link is no longer valid. Scan the code on the desktop again.',
  ROOM_FULL: 'Another phone is already connected to this room.',
  REPLACED: 'This room was opened on another device.',
  ROOM_EXPIRED: 'The room expired after inactivity. Reload the desktop page.',
};

/**
 * Phone side of TetherKit. Call `connectFromGesture()` from the
 * "Connect & Enable Sensors" tap so the iOS permission prompt, audio unlock
 * and wake lock all happen inside the user gesture.
 */
export class TetherController {
  readonly env: BrowserEnvironment = detectEnvironment();
  readonly feedback = new FeedbackDispatcher();
  readonly wakeLock = new WakeLockManager();
  readonly pipeline: SensorPipeline;
  readonly trackpad: TouchTrackpad;

  private readonly opts: {
    signalingUrl: string;
    iceServers: RTCIceServer[];
    p2pTimeoutMs: number;
    sendRateHz: number;
    keepAliveMs: number;
  };
  private readonly store: Store<ControllerState>;
  private readonly events = new Emitter<ControllerEvents>();
  private readonly orientation = new OrientationSource();
  private readonly sessionId = randomId(12);
  private seq = 0;

  private signal: SignalingClient | null = null;
  private rtc: RtcSession | null = null;
  private relay = false;
  private emu: BroadcastLink | null = null;
  private acked = false;
  private fatal = false;
  private running = false;

  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private relayTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  private held = false;
  private touchActive = false;
  private touch: Required<TouchBehavior> = { springBack: false, holdsPrimary: false };
  private gyroPose: NormalizedPose = { nx: 0, ny: 0, roll: 0 };
  private last = { nx: Number.NaN, ny: Number.NaN, roll: Number.NaN, held: false, at: Number.NEGATIVE_INFINITY, src: '' };
  private battery: number | undefined;

  constructor(options: TetherControllerOptions = {}) {
    this.opts = {
      signalingUrl: resolveSignalingUrl(options.signalingUrl),
      iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS,
      p2pTimeoutMs: options.p2pTimeoutMs ?? DEFAULT_P2P_TIMEOUT_MS,
      sendRateHz: options.sendRateHz ?? 60,
      keepAliveMs: options.keepAliveMs ?? 250,
    };
    this.pipeline = new SensorPipeline(options.pipeline);
    this.trackpad = new TouchTrackpad(options.trackpad);
    this.store = new Store<ControllerState>({
      status: 'idle',
      transport: null,
      target: null,
      app: null,
      inputSource: 'touch',
      sensorPermission: 'unknown',
      calibrated: false,
      primaryHeld: false,
      wakeLock: false,
      error: null,
    });
    this.wakeLock.onChange((held) => {
      this.store.set({ wakeLock: held });
      this.sendStatus();
    });
  }

  /** Reads `?room=ABC234&token=...` or `?emu=<channel>` from the page URL. */
  static targetFromSearch(search: string = typeof location === 'undefined' ? '' : location.search): ControllerTarget | null {
    const params = new URLSearchParams(search);
    const emu = params.get('emu');
    if (emu && /^[a-z0-9]{4,32}$/i.test(emu)) return { kind: 'emulator', channelId: emu };
    const room = params.get('room');
    if (room) {
      const roomId = normalizeRoomCode(room);
      if (isValidRoomCode(roomId)) {
        const token = params.get('token');
        return token ? { kind: 'room', roomId, token } : { kind: 'room', roomId };
      }
    }
    return null;
  }

  // ---- public API --------------------------------------------------------

  getState = (): ControllerState => this.store.get();
  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  /** Current normalized aim (gyro pipeline or trackpad). */
  getPose(): NormalizedPose {
    return this.store.get().inputSource === 'gyro' ? this.gyroPose : this.trackpad.output;
  }

  onFeedback(handler: (event: FeedbackEvent) => void): () => void {
    return this.events.on('feedback', handler);
  }

  /** Fires for every FeedbackEvent that carries `syncState`. */
  onSync(handler: (state: Record<string, unknown>) => void): () => void {
    return this.events.on('sync', handler);
  }

  /**
   * One-tap connect. Runs every gesture-bound API synchronously first:
   * iOS orientation permission, AudioContext unlock, Wake Lock.
   */
  connectFromGesture(target: ControllerTarget): Promise<InputSource> {
    const sensors: Promise<InputSource> =
      target.kind === 'emulator' ? Promise.resolve(this.useTouch()) : this.enableSensors();
    this.feedback.unlock();
    if (target.kind === 'room') void this.wakeLock.enable();
    this.connect(target);
    return sensors;
  }

  /**
   * Requests gyro access (call from a tap handler). Falls back to the Touch
   * Trackpad when permission is denied, unavailable, or no data arrives.
   */
  enableSensors(): Promise<InputSource> {
    if (this.env.isInAppBrowser || !this.env.hasOrientationEvent) {
      this.store.set({ sensorPermission: 'unavailable' });
      return Promise.resolve(this.useTouch());
    }
    // Synchronous call inside the gesture — see sensor-browser-safety.md.
    const permission = requestOrientationPermission();
    return permission.then(async (result): Promise<InputSource> => {
      this.store.set({ sensorPermission: result });
      if (result !== 'granted') return this.useTouch();
      this.orientation.start((sample, timeMs) => {
        this.gyroPose = this.pipeline.process(sample, timeMs);
        // Send right away instead of waiting for the next 60 Hz tick (saves up to one frame).
        if (this.store.get().inputSource === 'gyro') this.pump(false);
      });
      const gotData = await this.orientation.waitForData(1500);
      if (!gotData) {
        this.orientation.stop();
        this.store.set({ sensorPermission: 'unavailable' });
        return this.useTouch();
      }
      this.store.set({ inputSource: 'gyro', calibrated: this.pipeline.calibrated });
      this.sendStatus();
      return 'gyro';
    });
  }

  /** Switch to the Touch Trackpad fallback. */
  useTouch(): InputSource {
    this.orientation.stop();
    this.store.set({ inputSource: 'touch', calibrated: true });
    this.sendStatus();
    return 'touch';
  }

  /**
   * Recenter / Zero: current orientation becomes the neutral pose.
   * `quiet` skips the haptic tick and the `recenter` action — use it for
   * clutch-style grabs (zero the pose right before holding the primary button,
   * so every grab gets the full ±range).
   */
  recenter(options: { quiet?: boolean } = {}): void {
    if (this.store.get().inputSource === 'gyro') {
      this.pipeline.calibrate();
      this.gyroPose = this.pipeline.output;
    } else {
      this.trackpad.reset();
    }
    this.store.set({ calibrated: true });
    if (!options.quiet) {
      this.feedback.vibrate([18], 0.4);
      this.sendAction('recenter');
    }
    this.pump(true);
  }

  setPrimaryHeld(held: boolean): void {
    if (this.held === held) return;
    this.held = held;
    this.store.set({ primaryHeld: this.effectiveHeld() });
    this.pump(true);
  }

  setTouchBehavior(behavior: TouchBehavior): void {
    this.touch = { springBack: behavior.springBack ?? false, holdsPrimary: behavior.holdsPrimary ?? false };
  }

  touchStart(): void {
    this.touchActive = true;
    this.store.set({ primaryHeld: this.effectiveHeld() });
    this.pump(true);
  }

  touchMove(dxPx: number, dyPx: number, refPx: number): void {
    if (this.store.get().inputSource !== 'touch') return;
    this.trackpad.move(dxPx, dyPx, refPx);
  }

  touchEnd(): void {
    this.touchActive = false;
    if (this.touch.springBack && this.store.get().inputSource === 'touch') this.trackpad.reset();
    this.store.set({ primaryHeld: this.effectiveHeld() });
    this.pump(true);
  }

  sendAction(action: string, payload?: unknown): boolean {
    return this.send(
      payload === undefined ? { v: 1, type: 'action', action } : { v: 1, type: 'action', action, payload },
    );
  }

  connect(target: ControllerTarget): void {
    this.disconnectLinks();
    this.running = true;
    this.fatal = false;
    this.store.set({ target, status: 'connecting', error: null, transport: null });
    if (!this.pumpTimer) this.pumpTimer = setInterval(() => this.pump(false), 1000 / this.opts.sendRateHz);
    if (!this.statusTimer) this.statusTimer = setInterval(() => this.refreshStatus(), 5000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleVisibility);

    if (target.kind === 'emulator') {
      this.emu = new BroadcastLink(target.channelId, 'controller', (ch, data) => this.handleIncoming(ch, data));
      this.store.set({ transport: 'local-emulator', status: 'negotiating' });
      this.startHello();
    } else {
      this.connectSignaling(target);
    }
  }

  disconnect(): void {
    this.running = false;
    this.disconnectLinks();
    for (const timer of [this.pumpTimer, this.statusTimer]) if (timer) clearInterval(timer);
    this.pumpTimer = this.statusTimer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility);
    this.orientation.stop();
    void this.wakeLock.disable();
    this.store.set({ status: 'idle', transport: null });
  }

  // ---- signaling ---------------------------------------------------------

  private connectSignaling(target: Extract<ControllerTarget, { kind: 'room' }>): void {
    const client = new SignalingClient(this.opts.signalingUrl, {
      onOpen: () => {
        this.reconnectDelay = 1000;
        client.send({ t: 'join_room', roomId: target.roomId, ...(target.token ? { token: target.token } : {}) });
      },
      onMessage: (message) => this.handleSignal(message),
      onClose: () => {
        this.signal = null;
        if (this.relay) this.dropRemote();
        if (this.fatal || !this.running) return;
        if (!this.acked) this.store.set({ status: 'reconnecting' });
        this.scheduleReconnect();
      },
    });
    this.signal = client;
    client.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.fatal || !this.running) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const target = this.store.get().target;
      if (this.running && !this.signal && target?.kind === 'room') this.connectSignaling(target);
    }, delay);
  }

  private handleSignal(message: ServerToClient): void {
    switch (message.t) {
      case 'joined':
        this.store.set({ app: message.app, status: this.acked ? 'connected' : 'negotiating', error: null });
        this.startRelayTimer();
        break;
      case 'peer_ready':
        this.dropRemote();
        this.store.set({ status: 'negotiating' });
        this.startRelayTimer();
        if (!isWebRtcSupported()) this.activateRelay(true, 'webrtc-unsupported');
        break;
      case 'signal_offer':
        this.acceptOffer(message.data);
        break;
      case 'signal_ice':
        void this.rtc?.handleSignal('ice', message.data);
        break;
      case 'use_relay':
        this.activateRelay(false, message.reason ?? 'peer-request');
        break;
      case 'relay_frame':
        if (!this.relay) this.activateRelay(false, 'peer-relay-traffic');
        this.handleIncoming(message.ch, message.d);
        break;
      case 'peer_left':
        if (message.role === 'host') {
          this.dropRemote();
          this.store.set({ status: 'host-left' });
        }
        break;
      case 'error': {
        const fatal = FATAL_ERRORS[message.code];
        if (fatal) {
          this.fatal = true;
          this.dropRemote();
          this.signal?.close();
          this.signal = null;
          this.store.set({ status: 'error', error: fatal });
        } else {
          this.store.set({ error: message.message });
        }
        break;
      }
      default:
        break;
    }
  }

  private acceptOffer(offer: unknown): void {
    if (this.relay) return;
    this.rtc?.close();
    const session = new RtcSession({
      role: 'answerer',
      iceServers: this.opts.iceServers,
      sendSignal: (kind, data) =>
        this.signal?.send({ t: kind === 'answer' ? 'signal_answer' : kind === 'offer' ? 'signal_offer' : 'signal_ice', data }),
      onOpen: () => {
        if (this.relay || this.rtc !== session) return;
        if (this.relayTimer) clearTimeout(this.relayTimer);
        this.relayTimer = null;
        this.store.set({ transport: 'p2p' });
        this.startHello();
      },
      onMessage: (ch, data) => {
        if (!this.relay) this.handleIncoming(ch, data);
      },
      onFailed: (reason) => {
        if (this.rtc === session) this.activateRelay(true, reason);
      },
    });
    this.rtc = session;
    void session.handleSignal('offer', offer);
  }

  private startRelayTimer(): void {
    if (this.relayTimer) clearTimeout(this.relayTimer);
    // The host decides at p2pTimeoutMs; this is a backstop in case it never offers.
    this.relayTimer = setTimeout(() => {
      this.relayTimer = null;
      if (!this.relay && !this.rtc?.isOpen) this.activateRelay(true, 'p2p-timeout');
    }, this.opts.p2pTimeoutMs + 1500);
  }

  private activateRelay(notifyPeer: boolean, reason: string): void {
    if (this.relayTimer) clearTimeout(this.relayTimer);
    this.relayTimer = null;
    this.rtc?.close();
    this.rtc = null;
    if (this.relay) return;
    this.relay = true;
    if (notifyPeer) this.signal?.send({ t: 'use_relay', reason });
    this.store.set({ transport: 'ws-relay' });
    this.startHello();
  }

  /** Forget WebRTC/relay state for the remote host (signaling stays up). */
  private dropRemote(): void {
    if (this.relayTimer) clearTimeout(this.relayTimer);
    this.relayTimer = null;
    this.rtc?.close();
    this.rtc = null;
    this.relay = false;
    this.acked = false;
    this.stopHello();
    this.store.set({ transport: null });
  }

  private disconnectLinks(): void {
    this.dropRemote();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.signal?.close();
    this.signal = null;
    this.emu?.close();
    this.emu = null;
  }

  private handleVisibility = (): void => {
    if (document.visibilityState !== 'visible' || !this.running) return;
    const target = this.store.get().target;
    if (target?.kind === 'room' && !this.signal && !this.fatal) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.reconnectDelay = 1000;
      this.connectSignaling(target);
    }
    this.sendStatus();
    this.pump(true);
  };

  // ---- link --------------------------------------------------------------

  private startHello(): void {
    this.acked = false;
    this.stopHello();
    const hello = (): void => {
      this.send(
        {
          v: 1,
          type: 'hello',
          sessionId: this.sessionId,
          device: {
            platform: this.env.platform,
            inputSource: this.store.get().inputSource,
            hasVibration: this.env.hasVibration,
            inAppBrowser: this.env.isInAppBrowser,
          },
        },
        true,
      );
    };
    hello();
    this.helloTimer = setInterval(hello, 1000);
  }

  private stopHello(): void {
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
  }

  private sendRaw(channel: LinkChannel, data: string): boolean {
    if (this.emu) return this.emu.send(channel, data);
    if (this.relay) {
      if (!this.signal) return false;
      if (channel === 'sensor' && this.signal.bufferedAmount > 64 * 1024) return false;
      return this.signal.send({ t: 'relay_frame', ch: channel, d: data });
    }
    return this.rtc?.send(channel, data) ?? false;
  }

  /** @param beforeAck allow sending before the host acknowledged (hello only). */
  private send(message: TetherMessage, beforeAck = false): boolean {
    if (!this.acked && !beforeAck) return false;
    return this.sendRaw(channelFor(message.type), encodeMessage(message));
  }

  private handleIncoming(_channel: LinkChannel, raw: string): void {
    const message = decodeMessage(raw);
    if (!message) return;
    switch (message.type) {
      case 'ack':
        if (message.sessionId !== this.sessionId) return;
        this.acked = true;
        this.stopHello();
        this.store.set({ status: 'connected', app: message.app, error: null });
        this.last.at = Number.NEGATIVE_INFINITY;
        this.refreshStatus();
        this.pump(true);
        break;
      case 'ping':
        this.send({ v: 1, type: 'pong', id: message.id, t: message.t });
        break;
      case 'feedback':
        this.feedback.handle(message);
        this.events.emit('feedback', message);
        if (message.syncState) this.events.emit('sync', message.syncState);
        break;
      default:
        break;
    }
  }

  private effectiveHeld(): boolean {
    return (
      this.held || (this.touch.holdsPrimary && this.touchActive && this.store.get().inputSource === 'touch')
    );
  }

  private pump(force: boolean): void {
    if (!this.acked) return;
    const pose = this.getPose();
    const held = this.effectiveHeld();
    const src = this.store.get().inputSource;
    const now = performance.now();
    const last = this.last;
    // Unforced sends (timer tick or sensor event) are capped at sendRateHz.
    if (!force && now - last.at < 1000 / this.opts.sendRateHz - 1) return;
    const moved =
      Math.abs(pose.nx - last.nx) > 0.0005 ||
      Math.abs(pose.ny - last.ny) > 0.0005 ||
      Math.abs(pose.roll - last.roll) > 0.0005 ||
      Number.isNaN(last.nx);
    if (!force && !moved && held === last.held && src === last.src && now - last.at < this.opts.keepAliveMs) return;
    const sent = this.send({
      v: 1,
      type: 'sensor',
      seq: this.seq++,
      ts: now,
      inputSource: src,
      nx: pose.nx,
      ny: pose.ny,
      roll: pose.roll,
      primaryHeld: held,
    });
    if (sent) this.last = { nx: pose.nx, ny: pose.ny, roll: pose.roll, held, at: now, src };
  }

  private sendStatus(): void {
    const state = this.store.get();
    this.send({
      v: 1,
      type: 'status',
      inputSource: state.inputSource,
      calibrated: state.calibrated,
      awake: this.wakeLock.held,
      ...(this.battery !== undefined ? { battery: this.battery } : {}),
    });
  }

  private refreshStatus(): void {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number }> };
    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery()
        .then((battery) => {
          this.battery = battery.level;
          this.sendStatus();
        })
        .catch(() => this.sendStatus());
    } else {
      this.sendStatus();
    }
  }
}

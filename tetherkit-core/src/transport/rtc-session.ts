import type { LinkChannel } from './signal-types';

export type SignalKind = 'offer' | 'answer' | 'ice';

export interface RtcSessionOptions {
  role: 'offerer' | 'answerer';
  iceServers: RTCIceServer[];
  sendSignal(kind: SignalKind, data: unknown): void;
  /** Both DataChannels are open. */
  onOpen(): void;
  onMessage(channel: LinkChannel, data: string): void;
  /** ICE failed, the connection dropped, or a channel closed after opening. */
  onFailed(reason: string): void;
}

/** Sensor frames are dropped (not queued) when the SCTP buffer backs up. */
const SENSOR_BUFFER_LIMIT = 32 * 1024;
const DISCONNECT_GRACE_MS = 2500;

export const SENSOR_CHANNEL_LABEL = 'tether-sensor';
export const CONTROL_CHANNEL_LABEL = 'tether-control';

export function isWebRtcSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/**
 * One RTCPeerConnection with two DataChannels:
 * - `tether-sensor`  { ordered: false, maxRetransmits: 0 } — no head-of-line blocking
 * - `tether-control` { ordered: true } — reliable actions and feedback
 */
export class RtcSession {
  private pc: RTCPeerConnection;
  private sensor: RTCDataChannel | null = null;
  private control: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private opened = false;
  private closed = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: RtcSessionOptions) {
    this.pc = new RTCPeerConnection({ iceServers: options.iceServers });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) options.sendSignal('ice', event.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => this.handleConnectionState();
    if (options.role === 'answerer') {
      this.pc.ondatachannel = (event) => this.attach(event.channel);
    }
  }

  get isOpen(): boolean {
    return this.sensor?.readyState === 'open' && this.control?.readyState === 'open';
  }

  /** Offerer only: create channels and send the SDP offer. */
  async start(): Promise<void> {
    if (this.options.role !== 'offerer') return;
    this.attach(this.pc.createDataChannel(SENSOR_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 }));
    this.attach(this.pc.createDataChannel(CONTROL_CHANNEL_LABEL, { ordered: true }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    if (!this.closed && this.pc.localDescription) this.options.sendSignal('offer', this.pc.localDescription.toJSON());
  }

  async handleSignal(kind: SignalKind, data: unknown): Promise<void> {
    if (this.closed) return;
    try {
      if (kind === 'ice') {
        const candidate = data as RTCIceCandidateInit;
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(candidate);
        else this.pendingIce.push(candidate);
        return;
      }
      const description = data as RTCSessionDescriptionInit;
      if (kind === 'offer' && this.options.role === 'answerer') {
        await this.pc.setRemoteDescription(description);
        await this.flushIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        if (!this.closed && this.pc.localDescription) this.options.sendSignal('answer', this.pc.localDescription.toJSON());
      } else if (kind === 'answer' && this.options.role === 'offerer') {
        await this.pc.setRemoteDescription(description);
        await this.flushIce();
      }
    } catch (error) {
      console.warn('[tetherkit] WebRTC signaling step failed', error);
      this.fail('signaling-error');
    }
  }

  send(channel: LinkChannel, data: string): boolean {
    const dc = channel === 'sensor' ? this.sensor : this.control;
    if (!dc || dc.readyState !== 'open') return false;
    if (channel === 'sensor' && dc.bufferedAmount > SENSOR_BUFFER_LIMIT) return false;
    try {
      dc.send(data);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    for (const dc of [this.sensor, this.control]) {
      if (dc) {
        dc.onopen = dc.onclose = dc.onmessage = null;
        try {
          dc.close();
        } catch {
          /* ignore */
        }
      }
    }
    this.pc.onicecandidate = this.pc.onconnectionstatechange = this.pc.ondatachannel = null;
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }

  private attach(dc: RTCDataChannel): void {
    const channel: LinkChannel | null =
      dc.label === SENSOR_CHANNEL_LABEL ? 'sensor' : dc.label === CONTROL_CHANNEL_LABEL ? 'control' : null;
    if (!channel) return;
    if (channel === 'sensor') this.sensor = dc;
    else this.control = dc;
    dc.onmessage = (event) => {
      if (typeof event.data === 'string') this.options.onMessage(channel, event.data);
    };
    dc.onopen = () => {
      if (!this.opened && this.isOpen) {
        this.opened = true;
        this.options.onOpen();
      }
    };
    dc.onclose = () => {
      if (this.opened) this.fail(`${channel}-channel-closed`);
    };
    if (dc.readyState === 'open') dc.onopen?.(new Event('open'));
  }

  private async flushIce(): Promise<void> {
    const queued = this.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        /* stale candidate */
      }
    }
  }

  private handleConnectionState(): void {
    const state = this.pc.connectionState;
    if (state === 'failed' || state === 'closed') {
      this.fail(`ice-${state}`);
    } else if (state === 'disconnected') {
      if (!this.disconnectTimer) {
        this.disconnectTimer = setTimeout(() => {
          this.disconnectTimer = null;
          if (this.pc.connectionState === 'disconnected') this.fail('ice-disconnected');
        }, DISCONNECT_GRACE_MS);
      }
    } else if (state === 'connected' && this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.options.onFailed(reason);
  }
}

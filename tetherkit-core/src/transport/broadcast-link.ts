import type { LinkChannel, PeerRole } from './signal-types';

interface Envelope {
  tk: 1;
  from: PeerRole;
  ch: LinkChannel;
  d: string;
}

export function isBroadcastSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/**
 * Same-origin loopback transport for the Split-View emulator. Host and the
 * embedded controller iframe exchange the exact TetherProtocol strings that
 * would travel over WebRTC, wrapped in a tiny envelope.
 */
export class BroadcastLink {
  private channel: BroadcastChannel | null;

  constructor(
    channelId: string,
    private readonly role: PeerRole,
    onMessage: (channel: LinkChannel, data: string) => void,
  ) {
    this.channel = new BroadcastChannel(`tetherkit-emu:${channelId}`);
    this.channel.onmessage = (event: MessageEvent<unknown>) => {
      const env = event.data as Partial<Envelope> | null;
      if (!env || env.tk !== 1 || env.from === this.role || typeof env.d !== 'string') return;
      if (env.ch !== 'sensor' && env.ch !== 'control') return;
      onMessage(env.ch, env.d);
    };
  }

  send(channel: LinkChannel, data: string): boolean {
    if (!this.channel) return false;
    const envelope: Envelope = { tk: 1, from: this.role, ch: channel, d: data };
    this.channel.postMessage(envelope);
    return true;
  }

  close(): void {
    if (!this.channel) return;
    this.channel.onmessage = null;
    this.channel.close();
    this.channel = null;
  }
}

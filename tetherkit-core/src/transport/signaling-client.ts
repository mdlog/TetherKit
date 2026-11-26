import type { ClientToServer, ServerToClient } from './signal-types';

export interface SignalingHandlers {
  onOpen(): void;
  onMessage(message: ServerToClient): void;
  onClose(code: number, reason: string): void;
}

const KEEPALIVE_MS = 20_000;

/** JSON WebSocket wrapper for the signaling + relay server. */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private closedByUs = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SignalingHandlers,
  ) {}

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get bufferedAmount(): number {
    return this.ws?.bufferedAmount ?? 0;
  }

  connect(): void {
    if (this.ws) return;
    this.closedByUs = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (error) {
      queueMicrotask(() => this.handlers.onClose(1006, String(error)));
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.keepalive = setInterval(() => this.send({ t: 'ping' }), KEEPALIVE_MS);
      this.handlers.onOpen();
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof message === 'object' && message !== null && typeof (message as { t?: unknown }).t === 'string') {
        this.handlers.onMessage(message as ServerToClient);
      }
    };
    ws.onclose = (event) => {
      this.cleanup();
      if (!this.closedByUs) this.handlers.onClose(event.code, event.reason);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  send(message: ClientToServer): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.closedByUs = true;
    const ws = this.ws;
    this.cleanup();
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close(1000, 'bye');
  }

  private cleanup(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
    }
    this.ws = null;
  }
}

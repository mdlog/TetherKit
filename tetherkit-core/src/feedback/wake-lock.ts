/**
 * Keeps the phone screen on while the controller is active.
 * Re-acquires the lock whenever the page becomes visible again, because the
 * browser releases it automatically on tab switch / screen off.
 */
export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private listening = false;
  private changeListener: ((held: boolean) => void) | null = null;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  get held(): boolean {
    return this.sentinel !== null && !this.sentinel.released;
  }

  onChange(listener: (held: boolean) => void): void {
    this.changeListener = listener;
  }

  /** Request the lock (best-effort). Safe to call on unsupported browsers. */
  async enable(): Promise<boolean> {
    this.wanted = true;
    if (!this.listening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibility);
      this.listening = true;
    }
    return this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    if (this.listening) {
      document.removeEventListener('visibilitychange', this.handleVisibility);
      this.listening = false;
    }
    const sentinel = this.sentinel;
    this.sentinel = null;
    try {
      await sentinel?.release();
    } catch {
      /* already released */
    }
    this.changeListener?.(false);
  }

  private handleVisibility = (): void => {
    if (this.wanted && document.visibilityState === 'visible' && !this.held) void this.acquire();
  };

  private async acquire(): Promise<boolean> {
    if (!this.supported || typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
        this.changeListener?.(false);
      });
      this.changeListener?.(true);
      return true;
    } catch {
      // Battery saver, unsupported, or not allowed — the app keeps working.
      this.changeListener?.(false);
      return false;
    }
  }
}

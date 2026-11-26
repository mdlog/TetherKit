/** Counts rendered frames and reports frames-per-second every `windowMs`. */
export class FpsMeter {
  private frames = 0;
  private windowStart = -1;
  private current = 0;

  constructor(private readonly windowMs = 500) {}

  get fps(): number {
    return this.current;
  }

  /** Call once per rendered frame. Returns true when the fps value was refreshed. */
  tick(now: number): boolean {
    if (this.windowStart < 0) this.windowStart = now;
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return false;
    this.current = Math.round((this.frames * 1000) / elapsed);
    this.frames = 0;
    this.windowStart = now;
    return true;
  }
}

/**
 * Drops stale or duplicated sensor frames arriving on the unordered channel.
 * Invariant (PBT "Monotonic Sequence Guard"): `lastAcceptedSeq` never decreases
 * and every accepted seq is strictly greater than all previously accepted ones.
 */
export class FrameOrderGuard {
  private last = -1;

  get lastAcceptedSeq(): number {
    return this.last;
  }

  /** Returns true when the frame should be applied. */
  accept(seq: number): boolean {
    if (!Number.isSafeInteger(seq) || seq < 0) return false;
    if (seq <= this.last) return false;
    this.last = seq;
    return true;
  }

  /** Call when a new controller session starts (its seq restarts at 0). */
  reset(): void {
    this.last = -1;
  }
}

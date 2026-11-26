export const MAX_VIBRATION_ENTRIES = 10;
export const MAX_VIBRATION_ENTRY_MS = 1000;
export const MAX_VIBRATION_TOTAL_MS = 10_000;

/**
 * Makes any input safe for `navigator.vibrate()`:
 * at most 10 entries, each an integer in [0, 1000] ms, total <= 10 000 ms.
 * Invalid entries become 0 so the vibrate/pause alternation is preserved.
 */
export function sanitizeVibrationPattern(input: unknown): number[] {
  const list: unknown[] = typeof input === 'number' ? [input] : Array.isArray(input) ? input : [];
  const out: number[] = [];
  let total = 0;
  for (const raw of list) {
    if (out.length >= MAX_VIBRATION_ENTRIES) break;
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
    const ms = Math.min(MAX_VIBRATION_ENTRY_MS, Math.max(0, n)) + 0;
    if (total + ms > MAX_VIBRATION_TOTAL_MS) break;
    out.push(ms);
    total += ms;
  }
  // A pattern of only zeros does nothing; return empty to signal "no vibration".
  return out.some((ms) => ms > 0) ? out : [];
}

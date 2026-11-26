const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** URL-safe random id from `crypto.getRandomValues` (used for sessions and emulator channels). */
export function randomId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}

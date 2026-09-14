// Privacy PIN for GPA, rank and transcripts. A deterrent against someone
// glancing at your screen, not real security — so only a hash of the PIN is
// stored on the account. Keep identical to gradexis-web/src/lib/privacy-pin.js.

export const PIN_PATTERN = /^\d{4,8}$/;

export function hashPin(pin: string): string {
  const s = `gradiate-pin:${pin}`;
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let round = 0; round < 5000; round++) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i) + round;
      a = Math.imul(a ^ c, 16777619) >>> 0;
      b = Math.imul(b ^ (c * 31), 2246822519) >>> 0;
    }
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

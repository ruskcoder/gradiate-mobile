import { formatHex, parse } from 'culori';

// React Native's style system doesn't understand oklch(), so convert to hex
// the same way uniwind itself does internally before storing CSS variables.
export function toHex(color: string, fallback = '#6b7280'): string {
  const parsed = parse(color);
  return parsed ? (formatHex(parsed) ?? fallback) : fallback;
}

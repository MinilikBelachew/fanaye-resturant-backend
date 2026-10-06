import { createHash } from 'crypto';

/** Deterministic UUID v4-shaped id from a stable key (valid hex only). */
export function id(key: string): string {
  const h = createHash('md5').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function atTime(day: Date, hours: number, minutes = 0): Date {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function businessDateOnly(day: Date): Date {
  return new Date(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()),
  );
}

/** Simple seeded PRNG for repeatable history. */
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

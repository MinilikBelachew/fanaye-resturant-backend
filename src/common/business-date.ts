const ADDIS = 'Africa/Addis_Ababa';
export const DEFAULT_BRANCH_TIMEZONE = ADDIS;

export function calendarDayCode(
  now = new Date(),
  timeZone = ADDIS,
): 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun' {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(now) as any;
}

export function calendarYmd(now = new Date(), timeZone = ADDIS): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Date-only value for Prisma `@db.Date` (UTC midnight of the calendar day). */
export function businessDateUtc(now = new Date(), timeZone = ADDIS): Date {
  return new Date(`${calendarYmd(now, timeZone)}T00:00:00.000Z`);
}

export function addCalendarDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localDayRange(
  ymd: string,
  timeZoneOffset = '+03:00',
): { start: Date; end: Date } {
  return {
    start: new Date(`${ymd}T00:00:00${timeZoneOffset}`),
    end: new Date(`${ymd}T23:59:59.999${timeZoneOffset}`),
  };
}

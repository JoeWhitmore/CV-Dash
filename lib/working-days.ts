/**
 * Count working days (Mon-Fri) between two ISO date strings, inclusive of both endpoints.
 * Returns 0 if end is before start.
 */
export function workingDaysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Enumerate working-day ISO dates (Mon-Fri) between two endpoints, inclusive.
 * Returns [] if end is before start.
 */
export function enumerateWorkingDays(startISO: string, endISO: string): string[] {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  if (end < start) return [];

  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * For an arbitrary ISO date, return the most recent working day on or before it
 * (Saturday → Friday, Sunday → Friday, weekday → itself).
 */
export function rollBackToWorkingDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

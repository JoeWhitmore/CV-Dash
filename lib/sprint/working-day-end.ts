/**
 * Returns the end-of-working-day cutoff for a given ISO date in Australia/Brisbane (UTC+10).
 * We use 18:00 as the "end of business" timestamp.
 */
export function endOfWorkingDay(isoDate: string): Date {
  return new Date(`${isoDate}T18:00:00+10:00`);
}

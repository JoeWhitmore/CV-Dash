/**
 * Returns the "committed" cutoff: sprint startDate at 08:00 Australia/Brisbane.
 * Brisbane is UTC+10 year-round (no DST), so we hard-code the offset.
 */
export function committedCutoff(startDate: string | null): Date | null {
  if (!startDate) return null;
  return new Date(`${startDate}T08:00:00+10:00`);
}

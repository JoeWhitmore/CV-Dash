/**
 * Returns the "committed" cutoff: 00:00 Australia/Brisbane on the sprint's Jira startDate.
 * Brisbane is UTC+10 year-round (no DST), so we hard-code the offset.
 *
 * Semantics: the freeze captures sprint state at the instant Jira reports the sprint
 * started. Tickets present in the sprint at that moment AND in to-do / in-progress /
 * blocked status (see REMAINING_STATUSES) form the committed set tracked for the rest
 * of the sprint. Carryover tickets that came in already-in peer-review / testing / etc
 * are excluded — they weren't newly committed to this sprint.
 */
export function committedCutoff(startDate: string | null): Date | null {
  if (!startDate) return null;
  return new Date(`${startDate}T00:00:00+10:00`);
}

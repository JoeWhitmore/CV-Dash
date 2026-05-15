/**
 * Returns the "committed" cutoff: 08:00 Australia/Brisbane on the first weekday
 * (Mon-Fri) on or after the sprint's start date. Brisbane is UTC+10 year-round
 * (no DST), so we hard-code the offset.
 *
 * Jira often reports a sprint's startDate as the Sunday before the team's actual
 * Monday-morning sprint planning (the sprint is "activated" Sunday night Brisbane
 * time = late Sunday UTC). Without rolling forward to Monday, the freeze captures
 * the sprint state at Sunday 8am — i.e. before sprint planning has happened —
 * leaving the committed-ticket set tiny (~20% of the eventual sprint) and the
 * Points Committed KPI nonsensically low.
 */
export function committedCutoff(startDate: string | null): Date | null {
  if (!startDate) return null;
  const [y, m, d] = startDate.split("-").map(Number);
  // Anchor at noon UTC on the start date — the day-of-week is the same as it would
  // be in Brisbane (UTC+10 with no DST).
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = anchor.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days to roll forward to reach the next Monday (or stay on Mon-Fri):
  //   Sun (0) -> 1 (next Mon)
  //   Mon (1) -> 0
  //   Tue-Fri (2..5) -> 0 (treat as already valid)
  //   Sat (6) -> 2 (next Mon)
  const rollForward = dow === 0 ? 1 : dow === 6 ? 2 : 0;
  anchor.setUTCDate(anchor.getUTCDate() + rollForward);
  const yyyy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T08:00:00+10:00`);
}

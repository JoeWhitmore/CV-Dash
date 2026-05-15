import { syncFromJira } from "@/lib/actions/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily snapshot endpoint hit by Vercel Cron at 08:00 UTC (18:00 Brisbane) Mon-Fri.
 * Runs the same sync as the dashboard refresh button, which writes a per-day burndown
 * snapshot keyed by (sprint_id, for_date).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set
 * as a Vercel env var. We reject unauthenticated requests in production; in dev (no
 * CRON_SECRET set) the route is open for manual testing.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }
  const result = await syncFromJira();
  return Response.json(result);
}

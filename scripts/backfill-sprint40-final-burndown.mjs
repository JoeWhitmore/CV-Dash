// One-off: write a final burndown snapshot at sprint endDate for sprint 40, derived from the
// already-captured close-time roster. The going-forward code path does this automatically as
// part of close-detection; this script patches sprint 40 which was snapshotted just before
// that code shipped.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const REMAINING = new Set(["to-do", "blocked", "in-progress"]);
const SPRINT_ID = "1650"; // sprint 40

const sprintQ = await pool.query("SELECT end_date, committed_ticket_keys, closed_snapshot_captured_at FROM sprints WHERE id = $1", [SPRINT_ID]);
const sprint = sprintQ.rows[0];
if (!sprint) throw new Error(`No sprint ${SPRINT_ID}`);
if (!sprint.closed_snapshot_captured_at) throw new Error("Sprint not yet snapshotted — refresh first.");

const endDate = new Date(sprint.end_date).toISOString().slice(0, 10);
const committedSet = new Set(sprint.committed_ticket_keys ?? []);

const snap = await pool.query("SELECT key, status, points FROM closed_sprint_tickets WHERE sprint_id = $1", [SPRINT_ID]);
const totalPoints = snap.rows.reduce((s, t) => s + t.points, 0);
const remainingPoints = snap.rows.filter((t) => REMAINING.has(t.status)).reduce((s, t) => s + t.points, 0);
const committedRemainingPoints = committedSet.size > 0
  ? snap.rows.filter((t) => REMAINING.has(t.status) && committedSet.has(t.key)).reduce((s, t) => s + t.points, 0)
  : null;

console.log(`Writing burndown_snapshots row: sprint=${SPRINT_ID} forDate=${endDate} total=${totalPoints} remaining=${remainingPoints} committedRemaining=${committedRemainingPoints}`);

await pool.query(`
  INSERT INTO burndown_snapshots (sprint_id, for_date, captured_at, remaining_points, total_points, committed_remaining_points)
  VALUES ($1, $2, NOW(), $3, $4, $5)
  ON CONFLICT (sprint_id, for_date) DO UPDATE SET
    remaining_points = EXCLUDED.remaining_points,
    total_points = EXCLUDED.total_points,
    committed_remaining_points = EXCLUDED.committed_remaining_points,
    captured_at = EXCLUDED.captured_at
`, [SPRINT_ID, endDate, remainingPoints, totalPoints, committedRemainingPoints]);

console.log("Done.");
await pool.end();

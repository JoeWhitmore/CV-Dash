import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sprint = await pool.query("SELECT id, name, state, start_date, end_date, baseline_points, committed_ticket_keys, closed_snapshot_captured_at FROM sprints WHERE name ILIKE '%40%' ORDER BY name");
console.log("=== SPRINT 40-ish ROWS ===");
console.log(JSON.stringify(sprint.rows, null, 2));

for (const s of sprint.rows) {
  const sid = s.id;
  const live = await pool.query("SELECT key, status, points FROM tickets WHERE sprint_id = $1 ORDER BY key", [sid]);
  console.log(`\n=== LIVE tickets WHERE sprint_id=${sid} (${live.rows.length}) ===`);
  for (const r of live.rows) console.log(`  ${r.key} ${r.status} ${r.points}pts`);

  const snap = await pool.query("SELECT key, status, points FROM closed_sprint_tickets WHERE sprint_id = $1 ORDER BY key", [sid]);
  console.log(`\n=== closed_sprint_tickets WHERE sprint_id=${sid} (${snap.rows.length}) ===`);
  for (const r of snap.rows) console.log(`  ${r.key} ${r.status} ${r.points}pts`);

  const bd = await pool.query("SELECT for_date, remaining_points, total_points, committed_remaining_points, captured_at FROM burndown_snapshots WHERE sprint_id = $1 ORDER BY for_date", [sid]);
  console.log(`\n=== burndown_snapshots WHERE sprint_id=${sid} (${bd.rows.length}) ===`);
  for (const r of bd.rows) console.log(`  ${r.for_date.toISOString().slice(0,10)}  remaining=${r.remaining_points}  total=${r.total_points}  committedRemaining=${r.committed_remaining_points}  capturedAt=${r.captured_at.toISOString()}`);
}
await pool.end();

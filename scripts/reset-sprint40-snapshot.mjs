// Wipe sprint 40's close-time snapshot so the next sync re-captures it with the corrected
// last-working-day cutoff. Also deletes the final-day burndown row so it's re-written from
// the fresh snapshot.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SPRINT_ID = "1650";

await pool.query("DELETE FROM closed_sprint_tickets WHERE sprint_id = $1", [SPRINT_ID]);
await pool.query("DELETE FROM burndown_snapshots WHERE sprint_id = $1 AND for_date >= $2", [SPRINT_ID, "2026-05-15"]);
await pool.query("UPDATE sprints SET state = 'active', closed_snapshot_captured_at = NULL WHERE id = $1", [SPRINT_ID]);
console.log("Sprint 40 snapshot reset. Run the sync to re-capture.");
await pool.end();

// Wipe sprint 41's commitment freeze so the next sync re-captures it under the new rules:
//   1. cutoff = sprint startDate at 00:00 Brisbane (was Mon 8AM Brisbane)
//   2. only tickets in to-do / in-progress / blocked at cutoff join the committed set
// Also clears committed_remaining_points on existing burndown snapshots so the historical
// backfill re-runs from scratch with the new committed set.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SPRINT_ID = "1683"; // Sprint 41

const before = await pool.query(
  "SELECT id, name, committed_ticket_keys, committed_captured_at FROM sprints WHERE id = $1",
  [SPRINT_ID],
);
if (before.rows.length === 0) {
  console.log(`Sprint ${SPRINT_ID} not found.`);
  process.exit(1);
}
const row = before.rows[0];
console.log(
  `Before: ${row.name} | committed=${row.committed_ticket_keys?.length ?? 0} tickets | capturedAt=${row.committed_captured_at?.toISOString?.() ?? row.committed_captured_at}`,
);

await pool.query(
  "UPDATE sprints SET committed_ticket_keys = NULL, committed_captured_at = NULL WHERE id = $1",
  [SPRINT_ID],
);
const bdResult = await pool.query(
  "UPDATE burndown_snapshots SET committed_remaining_points = NULL WHERE sprint_id = $1",
  [SPRINT_ID],
);

console.log(
  `Reset complete. Cleared commitment + ${bdResult.rowCount} burndown rows. Next sync re-captures.`,
);
await pool.end();

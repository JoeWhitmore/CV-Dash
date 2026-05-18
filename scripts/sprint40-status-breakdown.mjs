import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SPRINT_ID = "1650";

const sprintQ = await pool.query("SELECT end_date, committed_ticket_keys FROM sprints WHERE id = $1", [SPRINT_ID]);
const sprint = sprintQ.rows[0];
const committedSet = new Set(sprint.committed_ticket_keys);

const q = await pool.query("SELECT key, status, points FROM closed_sprint_tickets WHERE sprint_id = $1 ORDER BY status, points DESC", [SPRINT_ID]);

const byStatus = {};
for (const t of q.rows) {
  if (!committedSet.has(t.key)) continue;
  if (!byStatus[t.status]) byStatus[t.status] = { count: 0, points: 0, keys: [] };
  byStatus[t.status].count++;
  byStatus[t.status].points += t.points;
  byStatus[t.status].keys.push(`${t.key}(${t.points})`);
}

console.log(`=== Committed tickets status at sprint 40 close (endDate=${new Date(sprint.end_date).toISOString().slice(0,10)}) ===\n`);
const order = ["to-do", "blocked", "in-progress", "peer-review", "testing", "done", "closed"];
let total = 0;
let pastPR = 0;
let trulyDone = 0;
let remaining = 0;
for (const s of order) {
  if (!byStatus[s]) continue;
  const { count, points, keys } = byStatus[s];
  total += points;
  if (["peer-review", "testing", "done", "closed"].includes(s)) pastPR += points;
  if (["done", "closed"].includes(s)) trulyDone += points;
  if (["to-do", "blocked", "in-progress"].includes(s)) remaining += points;
  console.log(`  ${s.padEnd(12)}  ${String(count).padStart(2)} tickets,  ${String(points).padStart(3)} pts`);
  console.log(`               ${keys.join(", ")}`);
  console.log();
}
console.log(`\nTotals:`);
console.log(`  Total committed:           ${total} pts`);
console.log(`  Truly done (done+closed):  ${trulyDone} pts`);
console.log(`  Reached peer-review+:      ${pastPR} pts  ← what the KPI calls "Points to PR" / what burndown counts as "complete"`);
console.log(`  Still incomplete:          ${remaining} pts  ← what burndown actual line shows on 5/15`);
console.log(`\n→ Of the ${pastPR} "reached PR" pts, ${pastPR - trulyDone} are still in peer-review/testing, not actually released.`);

await pool.end();

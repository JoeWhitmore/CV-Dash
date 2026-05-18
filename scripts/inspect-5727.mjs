import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// CV-5727 — is it in sprint 41?
const t = (
  await pool.query(
    "SELECT key, status, points, sprint_id, type FROM tickets WHERE key = $1",
    ["CV-5727"],
  )
).rows[0];
console.log("CV-5727:", t);

// How many tickets are in sprint 1683 but NOT in committed_ticket_keys?
const sprint = (
  await pool.query(
    "SELECT committed_ticket_keys FROM sprints WHERE id = '1683'",
  )
).rows[0];
const committed = new Set(sprint.committed_ticket_keys ?? []);
const inSprint = (
  await pool.query(
    "SELECT key, status, points, type FROM tickets WHERE sprint_id = '1683'",
  )
).rows;

const notCommitted = inSprint.filter((t) => !committed.has(t.key));
const completeStatuses = new Set(["peer-review", "testing", "done", "closed"]);

const buckets = { todo: [], inProgress: [], complete: [] };
for (const t of notCommitted) {
  if (t.status === "to-do") buckets.todo.push(t);
  else if (t.status === "in-progress") buckets.inProgress.push(t);
  else if (completeStatuses.has(t.status)) buckets.complete.push(t);
}

const sum = (arr) => arr.reduce((s, t) => s + t.points, 0);
console.log(`\nSprint 41: ${inSprint.length} tickets total, ${committed.size} committed`);
console.log(`NOT committed (spillover): ${notCommitted.length} tickets`);
console.log(`  to-do:       ${buckets.todo.length} tickets, ${sum(buckets.todo)}pts`);
console.log(`  in-progress: ${buckets.inProgress.length} tickets, ${sum(buckets.inProgress)}pts`);
console.log(`  complete:    ${buckets.complete.length} tickets, ${sum(buckets.complete)}pts`);

console.log(`\nIf scope = whole sprint (315 tickets):`);
const totalPts = sum(inSprint);
const completePts = inSprint.filter((t) => completeStatuses.has(t.status)).reduce((s, t) => s + t.points, 0);
console.log(`  pointsCommitted = ${totalPts}`);
console.log(`  pointsToPr      = ${completePts}`);
console.log(`  %               = ${((completePts / totalPts) * 100).toFixed(1)}%`);
await pool.end();

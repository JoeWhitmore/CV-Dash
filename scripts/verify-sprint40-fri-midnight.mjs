// Independent re-verification: for each committed ticket in sprint 40, fetch its Jira changelog
// and replay to find its status at Friday 2026-05-15 midnight Brisbane (= Sat 00:00 Brisbane
// = Fri 14:00:00Z). Compare to what's in closed_sprint_tickets to check for snapshot bugs.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const baseUrl = process.env.JIRA_BASE_URL;
const email = process.env.JIRA_EMAIL;
const apiToken = process.env.JIRA_API_TOKEN;
const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

const CUTOFF = new Date("2026-05-15T14:00:00Z");

const STATUS_MAP = {
  "To Do": "to-do",
  "Open": "to-do",
  "Backlog": "to-do",
  "Blocked": "blocked",
  "In Progress": "in-progress",
  "In Development": "in-progress",
  "Code Review": "peer-review",
  "Peer Review": "peer-review",
  "In Review": "peer-review",
  "Testing": "testing",
  "In QA": "testing",
  "QA": "testing",
  "Ready for QA": "testing",
  "Done": "done",
  "Closed": "closed",
  "Resolved": "done",
};
const map = (s) => STATUS_MAP[s] ?? `?${s}?`;

async function fetchChangelog(key) {
  const all = [];
  let startAt = 0;
  while (true) {
    const r = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/changelog?maxResults=100&startAt=${startAt}`, {
      headers: { Accept: "application/json", Authorization: auth },
    });
    if (!r.ok) throw new Error(`${key}: ${r.status}`);
    const j = await r.json();
    all.push(...j.values);
    startAt += j.values.length;
    if (j.isLast || startAt >= j.total) break;
  }
  return all;
}

async function fetchCurrentStatus(key) {
  const r = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`, {
    headers: { Accept: "application/json", Authorization: auth },
  });
  const j = await r.json();
  return j.fields.status.name;
}

function statusAtTime(currentStatus, changelog, at) {
  const cutoff = at.getTime();
  const statusItems = changelog
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === "status")
        .map((i) => ({ created: new Date(h.created).getTime(), toString: i.toString, fromString: i.fromString })),
    )
    .sort((a, b) => a.created - b.created);

  if (statusItems.length === 0) return currentStatus;
  const before = statusItems.filter((x) => x.created <= cutoff);
  if (before.length > 0) return before[before.length - 1].toString;
  return statusItems[0].fromString;
}

const sprint = await pool.query("SELECT committed_ticket_keys FROM sprints WHERE id = '1650'");
const keys = sprint.rows[0].committed_ticket_keys;

const snapshot = await pool.query("SELECT key, status, points FROM closed_sprint_tickets WHERE sprint_id = '1650'");
const snapshotMap = new Map(snapshot.rows.map((r) => [r.key, { status: r.status, points: r.points }]));

console.log(`Verifying ${keys.length} committed tickets against Jira at cutoff ${CUTOFF.toISOString()}\n`);

const byStatus = {};
const mismatches = [];
let i = 0;
for (const key of keys) {
  i++;
  const [cur, cl] = await Promise.all([fetchCurrentStatus(key), fetchChangelog(key)]);
  const jiraStatusRaw = statusAtTime(cur, cl, CUTOFF);
  const jiraStatusMapped = map(jiraStatusRaw);

  const snap = snapshotMap.get(key);
  const snapStatus = snap?.status ?? "(MISSING FROM SNAPSHOT)";
  const points = snap?.points ?? 0;

  if (snapStatus !== jiraStatusMapped) {
    mismatches.push({ key, jira: `${jiraStatusRaw} → ${jiraStatusMapped}`, snap: snapStatus, points });
  }
  byStatus[jiraStatusMapped] = (byStatus[jiraStatusMapped] ?? 0) + points;
  process.stdout.write(`\r  Checked ${i}/${keys.length}…`);
}
console.log("\n");

console.log("=== Per-Jira status counts at Fri 5/15 midnight Brisbane (committed only) ===");
for (const [s, pts] of Object.entries(byStatus).sort()) {
  console.log(`  ${s.padEnd(15)} ${pts} pts`);
}

if (mismatches.length === 0) {
  console.log("\n✓ Snapshot matches Jira at cutoff — no bugs in snapshot logic.");
} else {
  console.log(`\n✗ ${mismatches.length} mismatches between snapshot and Jira-replayed status:\n`);
  for (const m of mismatches) {
    console.log(`  ${m.key} (${m.points}pts):  Jira says ${m.jira},  snapshot says ${m.snap}`);
  }
}

await pool.end();

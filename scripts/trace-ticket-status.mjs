// Inspect a single ticket's status changelog around sprint 40 close (Fri 5/15 midnight Brisbane).
const baseUrl = process.env.JIRA_BASE_URL;
const email = process.env.JIRA_EMAIL;
const apiToken = process.env.JIRA_API_TOKEN;
const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

const key = process.argv[2] || "CV-5703";
const cutoff = new Date("2026-05-15T14:00:00Z"); // Fri midnight Brisbane

const res = await fetch(`${baseUrl}/rest/api/3/issue/${key}/changelog?maxResults=100`, {
  headers: { Accept: "application/json", Authorization: auth },
});
const data = await res.json();
console.log(`=== ${key} status changelog ===`);
console.log(`Cutoff (Fri 5/15 end-of-day Brisbane) = ${cutoff.toISOString()}\n`);

const statusChanges = data.values
  .flatMap((h) => h.items.filter((i) => i.field === "status").map((i) => ({ created: h.created, from: i.fromString, to: i.toString })))
  .sort((a, b) => new Date(a.created) - new Date(b.created));

for (const c of statusChanges) {
  const afterCutoff = new Date(c.created) > cutoff;
  console.log(`  ${c.created}  ${c.from} → ${c.to}  ${afterCutoff ? "← AFTER CUTOFF" : ""}`);
}

const lastBeforeCutoff = statusChanges.filter((c) => new Date(c.created) <= cutoff).pop();
console.log(`\nLast transition before Fri 5/15 midnight Brisbane: ${lastBeforeCutoff ? `${lastBeforeCutoff.from} → ${lastBeforeCutoff.to}` : "(none)"}`);

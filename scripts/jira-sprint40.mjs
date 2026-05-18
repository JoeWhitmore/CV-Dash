const baseUrl = process.env.JIRA_BASE_URL;
const email = process.env.JIRA_EMAIL;
const apiToken = process.env.JIRA_API_TOKEN;
const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

const res = await fetch(`${baseUrl}/rest/agile/1.0/sprint/1650`, {
  headers: { Accept: "application/json", Authorization: auth },
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));

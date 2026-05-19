import type {
  JiraChangelogEntry,
  JiraIssueChangelogResponse,
  JiraIssueSearchResponse,
  JiraSprintListResponse,
} from "@/lib/jira/types";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  boardId: string;
  pointsField: string;
}

export class JiraAuthError extends Error {}
export class JiraRateLimitError extends Error {}
export class JiraTransportError extends Error {}

const FIELDS = ["summary", "status", "issuetype", "assignee", "updated", "created"];

function authHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function jiraFetch<T>(url: string, cfg: JiraConfig, attempt = 1): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: authHeader(cfg.email, cfg.apiToken),
    },
  });

  if (res.status === 401) {
    throw new JiraAuthError("Jira credentials rejected — check JIRA_EMAIL / JIRA_API_TOKEN.");
  }
  if (res.status === 429) {
    if (attempt < 2) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return jiraFetch<T>(url, cfg, attempt + 1);
    }
    throw new JiraRateLimitError("Jira rate limit hit — try again in a minute.");
  }
  if (res.status >= 500 && res.status < 600) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500));
      return jiraFetch<T>(url, cfg, attempt + 1);
    }
    throw new JiraTransportError(`Jira returned ${res.status} after retry.`);
  }
  if (!res.ok) {
    throw new JiraTransportError(`Jira returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function fetchActiveAndFutureSprints(
  cfg: JiraConfig,
): Promise<JiraSprintListResponse> {
  const url = `${cfg.baseUrl}/rest/agile/1.0/board/${cfg.boardId}/sprint?state=active,future&maxResults=50`;
  return jiraFetch<JiraSprintListResponse>(url, cfg);
}

const PAGE_SIZE = 100;

/**
 * Fetches every issue for a sprint, paginating via startAt/total until exhausted.
 * The active sprint commonly has hundreds of issues — Jira caps page size at 100.
 */
export async function fetchIssuesForSprint(
  cfg: JiraConfig,
  sprintId: string,
): Promise<JiraIssueSearchResponse> {
  const fields = [...FIELDS, cfg.pointsField].join(",");
  let startAt = 0;
  const all: JiraIssueSearchResponse["issues"] = [];
  let total = 0;

  while (true) {
    const url =
      `${cfg.baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue` +
      `?fields=${encodeURIComponent(fields)}` +
      `&maxResults=${PAGE_SIZE}` +
      `&startAt=${startAt}`;
    const page = await jiraFetch<JiraIssueSearchResponse>(url, cfg);
    all.push(...page.issues);
    total = page.total;
    startAt += page.issues.length;
    if (page.issues.length === 0 || startAt >= total) break;
  }

  return { startAt: 0, maxResults: total, total, issues: all };
}

/**
 * Fetches a single issue by key. Used for close-time snapshotting where the issue may no longer
 * be returned by `/sprint/{id}/issue` (e.g. it was carried over to a newer sprint after close).
 */
export async function fetchIssueByKey(
  cfg: JiraConfig,
  key: string,
): Promise<JiraIssueSearchResponse["issues"][number]> {
  const fields = [...FIELDS, cfg.pointsField].join(",");
  const url = `${cfg.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields)}`;
  return jiraFetch<JiraIssueSearchResponse["issues"][number]>(url, cfg);
}

export function jiraConfigFromEnv(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const boardId = process.env.JIRA_BOARD_ID;
  const pointsField = process.env.JIRA_STORY_POINTS_FIELD;

  const missing: string[] = [];
  if (!baseUrl) missing.push("JIRA_BASE_URL");
  if (!email) missing.push("JIRA_EMAIL");
  if (!apiToken) missing.push("JIRA_API_TOKEN");
  if (!boardId) missing.push("JIRA_BOARD_ID");
  if (!pointsField) missing.push("JIRA_STORY_POINTS_FIELD");
  if (missing.length) {
    throw new Error(`Jira not configured. Missing env var(s): ${missing.join(", ")}.`);
  }

  return {
    baseUrl: baseUrl!,
    email: email!,
    apiToken: apiToken!,
    boardId: boardId!,
    pointsField: pointsField!,
  };
}

/**
 * Fetches every Epic in the project. Used by the Epics tab — independent of sprint membership.
 * Uses /rest/api/3/search with JQL. Pagination via `nextPageToken` because the new search API
 * deprecates startAt for large result sets.
 */
export async function fetchAllEpics(
  cfg: JiraConfig,
  projectKey: string,
): Promise<JiraIssueSearchResponse> {
  const fields = ["summary", "status"].join(",");
  const all: JiraIssueSearchResponse["issues"] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      jql: `project = ${projectKey} AND issuetype = Epic`,
      fields,
      maxResults: String(PAGE_SIZE),
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);
    const url = `${cfg.baseUrl}/rest/api/3/search/jql?${params.toString()}`;
    const page = await jiraFetch<
      JiraIssueSearchResponse & { nextPageToken?: string; isLast?: boolean }
    >(url, cfg);
    all.push(...page.issues);
    if (page.isLast || !page.nextPageToken || page.issues.length === 0) break;
    nextPageToken = page.nextPageToken;
  }

  return { startAt: 0, maxResults: all.length, total: all.length, issues: all };
}

/**
 * Fetches all child issues under any of the supplied epic keys, in one paginated JQL.
 * Used to derive ticketCount and assignee set for each epic. JQL is chunked at 50 keys
 * per call to stay well under Jira's URL length limits.
 */
export async function fetchEpicChildren(
  cfg: JiraConfig,
  projectKey: string,
  epicKeys: string[],
): Promise<JiraIssueSearchResponse["issues"]> {
  if (epicKeys.length === 0) return [];
  const CHUNK = 50;
  const fields = ["summary", "status", "assignee", "parent"].join(",");
  const all: JiraIssueSearchResponse["issues"] = [];

  for (let i = 0; i < epicKeys.length; i += CHUNK) {
    const chunk = epicKeys.slice(i, i + CHUNK);
    const jql = `project = ${projectKey} AND parent in (${chunk.join(",")})`;
    let nextPageToken: string | undefined;
    while (true) {
      const params = new URLSearchParams({
        jql,
        fields,
        maxResults: String(PAGE_SIZE),
      });
      if (nextPageToken) params.set("nextPageToken", nextPageToken);
      const url = `${cfg.baseUrl}/rest/api/3/search/jql?${params.toString()}`;
      const page = await jiraFetch<
        JiraIssueSearchResponse & { nextPageToken?: string; isLast?: boolean }
      >(url, cfg);
      all.push(...page.issues);
      if (page.isLast || !page.nextPageToken || page.issues.length === 0) break;
      nextPageToken = page.nextPageToken;
    }
  }

  return all;
}

/**
 * Fetches the full changelog for an issue, paginating until exhausted.
 * Uses /rest/api/3 because the agile endpoint does not expose per-issue changelog.
 */
export async function fetchIssueChangelog(
  cfg: JiraConfig,
  issueKey: string,
): Promise<JiraIssueChangelogResponse> {
  let startAt = 0;
  const all: JiraChangelogEntry[] = [];
  let total = 0;

  while (true) {
    const url =
      `${cfg.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog` +
      `?maxResults=100&startAt=${startAt}`;
    const page = await jiraFetch<JiraIssueChangelogResponse>(url, cfg);
    all.push(...page.values);
    total = page.total;
    startAt += page.values.length;
    if (page.values.length === 0 || page.isLast || startAt >= total) break;
  }

  return { startAt: 0, maxResults: total, total, isLast: true, values: all };
}

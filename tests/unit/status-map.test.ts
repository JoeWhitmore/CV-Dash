import { describe, expect, it } from "vitest";
import { mapJiraStatus } from "@/lib/jira/status-map";

describe("mapJiraStatus", () => {
  it.each([
    // CV-specific statuses (live, taken from project taxonomy)
    ["To Do", "to-do"],
    ["Backlog", "to-do"],
    ["Planned", "to-do"],
    ["Ready For Dev", "to-do"],
    ["Ready For Development", "to-do"],
    ["Discovery", "to-do"],
    ["Design", "to-do"],
    ["Needs Design", "to-do"],
    ["Blocked", "blocked"],
    ["In Progress", "in-progress"],
    ["Building", "in-progress"],
    ["Awaiting Feedback", "in-progress"],
    // "In Review" / "Code Review" are visually merged with Peer Review on the dashboard,
    // so they map to the same domain status.
    ["In Review", "peer-review"],
    ["Peer review", "peer-review"],
    ["In QA", "testing"],
    ["Testing/UAT", "testing"],
    ["Done", "done"],
    ["Ready For Release", "done"],
    ["Won't Do", "closed"],
    // Common Jira defaults retained for defensiveness across instances
    ["Open", "to-do"],
    ["In Development", "in-progress"],
    ["Code Review", "peer-review"],
    ["Peer Review", "peer-review"],
    ["Ready for Review", "peer-review"],
    ["In Testing", "testing"],
    ["QA", "testing"],
    ["Testing", "testing"],
    ["Resolved", "done"],
    ["Closed", "closed"],
  ])("maps %s → %s", (jiraName, expected) => {
    expect(mapJiraStatus(jiraName).status).toBe(expected);
    expect(mapJiraStatus(jiraName).warning).toBeUndefined();
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(mapJiraStatus("  to do  ").status).toBe("to-do");
    expect(mapJiraStatus("PEER REVIEW").status).toBe("peer-review");
    expect(mapJiraStatus("peer review").status).toBe("peer-review"); // CV's exact casing
  });

  it("falls back to 'to-do' with a warning for unmapped statuses", () => {
    // 'Escalated' is intentionally unmapped per design decision (2026-05-15)
    const result = mapJiraStatus("Escalated");
    expect(result.status).toBe("to-do");
    expect(result.warning).toBe("Unknown Jira status: 'Escalated' — mapped to 'to-do'");
  });

  it("falls back to 'to-do' with a warning for genuinely unknown names", () => {
    const result = mapJiraStatus("Pending Triage");
    expect(result.status).toBe("to-do");
    expect(result.warning).toBe("Unknown Jira status: 'Pending Triage' — mapped to 'to-do'");
  });
});

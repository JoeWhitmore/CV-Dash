import { describe, expect, it } from "vitest";
import { parseSprintList, parseIssueIntoTicket } from "@/lib/jira/parsers";
import sprintsFixture from "@/lib/jira/__fixtures__/sprints.json";
import issuesFixture from "@/lib/jira/__fixtures__/issues-sprint-42.json";
import type { JiraIssueSearchResponse, JiraSprintListResponse } from "@/lib/jira/types";

const POINTS_FIELD = "customfield_10034";

describe("parseSprintList", () => {
  it("converts active + future sprints, normalises dates to ISO date strings", () => {
    const result = parseSprintList(sprintsFixture as JiraSprintListResponse);
    expect(result).toEqual([
      {
        id: "42",
        name: "Sprint 42",
        state: "active",
        startDate: "2026-05-05",
        endDate: "2026-05-18",
        jiraBoardId: "36",
      },
      {
        id: "43",
        name: "Sprint 43",
        state: "future",
        startDate: null,
        endDate: null,
        jiraBoardId: "36",
      },
    ]);
  });
});

describe("parseIssueIntoTicket", () => {
  it("maps a complete assigned story; sprintId comes from the caller, not the issue", () => {
    const issue = (issuesFixture as JiraIssueSearchResponse).issues[0];
    const result = parseIssueIntoTicket(issue, "42", { pointsField: POINTS_FIELD });
    expect(result.ticket).toMatchObject({
      key: "CV-1300",
      title: "Add sprint selector to dashboard",
      type: "story",
      status: "to-do",
      points: 3,
      sprintId: "42",
    });
    expect(result.assignee).toMatchObject({
      jiraAccountId: "5b10ac8d82e05b22cc7d4ef5",
      name: "Joe Whitmore",
    });
    expect(result.warnings).toEqual([]);
  });

  it("handles unassigned bug with null points; status normalises case-insensitively", () => {
    const issue = (issuesFixture as JiraIssueSearchResponse).issues[1];
    const result = parseIssueIntoTicket(issue, "42", { pointsField: POINTS_FIELD });
    expect(result.ticket.points).toBe(0);
    expect(result.ticket.assigneeId).toBeNull();
    expect(result.assignee).toBeNull();
    expect(result.ticket.status).toBe("peer-review"); // 'Peer review' (lowercase r) is CV's real casing
  });

  it("collects warnings for unknown status and type", () => {
    const issue = {
      key: "CV-7777",
      fields: {
        summary: "Weird",
        status: { name: "Awaiting Cosmic Alignment" },
        issuetype: { name: "Epic" },
        assignee: null,
        updated: "2026-05-14T00:00:00Z",
        customfield_10034: 5,
      },
    };
    const result = parseIssueIntoTicket(issue as any, "42", { pointsField: POINTS_FIELD });
    expect(result.warnings.length).toBe(2);
    expect(result.ticket.status).toBe("to-do");
    expect(result.ticket.type).toBe("task");
  });

  it("rounds fractional story points (Jira returns floats like 2.0)", () => {
    const issue = {
      key: "CV-1234",
      fields: {
        summary: "Fractional",
        status: { name: "In Progress" },
        issuetype: { name: "Task" },
        assignee: null,
        updated: "2026-05-14T00:00:00Z",
        customfield_10034: 2.5,
      },
    };
    const result = parseIssueIntoTicket(issue as any, "1650", { pointsField: POINTS_FIELD });
    expect(result.ticket.points).toBe(3); // 2.5 rounded
    expect(result.ticket.sprintId).toBe("1650");
  });
});

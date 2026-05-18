import { describe, expect, it } from "vitest";
import type { JiraChangelogEntry, JiraIssue } from "@/lib/jira/types";
import {
  buildClosedSprintBurndownSnapshot,
  buildClosedSprintSnapshot,
  type ClosedTicketSnapshot,
} from "@/lib/sync/close-snapshot";

const POINTS_FIELD = "customfield_10020";

function issue(opts: {
  key: string;
  summary?: string;
  type?: string;
  status?: string;
  points?: number;
  assignee?: { accountId: string; displayName: string } | null;
  created?: string;
  updated?: string;
}): JiraIssue {
  return {
    key: opts.key,
    fields: {
      summary: opts.summary ?? opts.key,
      issuetype: { name: opts.type ?? "Story" },
      status: { name: opts.status ?? "Done" },
      assignee: opts.assignee
        ? {
            accountId: opts.assignee.accountId,
            displayName: opts.assignee.displayName,
            avatarUrls: { "48x48": "" },
          }
        : null,
      created: opts.created ?? "2026-04-01T00:00:00Z",
      updated: opts.updated ?? "2026-05-18T00:00:00Z",
      [POINTS_FIELD]: opts.points ?? 0,
    },
  };
}

const statusChange = (created: string, from: string, to: string): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "status", from, fromString: from, to, toString: to }],
});

const sprintChange = (created: string, from: string, to: string): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "Sprint", from, fromString: from, to, toString: to }],
});

const NOW = new Date("2026-05-18T03:00:00Z");

describe("buildClosedSprintSnapshot", () => {
  it("captures ticket as of sprint endDate when ticket is in sprint at close", () => {
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({ key: "CV-1", points: 5, status: "Done" }),
          changelog: [statusChange("2026-05-14T05:00:00Z", "In Progress", "Done")],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sprintId: "40",
      key: "CV-1",
      status: "done",
      points: 5,
      capturedAt: NOW,
    });
  });

  it("uses status at sprint end (end-of-day Brisbane), not current status", () => {
    // Sprint ended 2026-05-15. End-of-day Brisbane = 2026-05-16T00:00:00+10:00 = 2026-05-15T14:00:00Z.
    // At that moment the ticket was "In Progress". It became "Done" two days later (in next sprint).
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({ key: "CV-2", points: 3, status: "Done" }),
          changelog: [
            statusChange("2026-05-10T05:00:00Z", "To Do", "In Progress"),
            statusChange("2026-05-17T05:00:00Z", "In Progress", "Done"),
          ],
        },
      ],
    });

    expect(result[0].status).toBe("in-progress");
  });

  it("excludes candidates that were not in the sprint at close (moved out before endDate)", () => {
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({ key: "CV-3", points: 5 }),
          changelog: [
            sprintChange("2026-05-01T05:00:00Z", "", "40"),
            sprintChange("2026-05-10T05:00:00Z", "40", "41"), // moved out before close
          ],
        },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it("includes candidates moved into the sprint before endDate (carry-in)", () => {
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({ key: "CV-4", points: 2 }),
          changelog: [sprintChange("2026-05-12T05:00:00Z", "", "40")],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("CV-4");
  });

  it("captures title, type, points, assigneeId from current issue fields", () => {
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({
            key: "CV-5",
            summary: "Add login flow",
            type: "Bug",
            points: 8,
            assignee: { accountId: "abc123", displayName: "Jane Doe" },
          }),
          changelog: [],
        },
      ],
    });

    expect(result[0]).toMatchObject({
      title: "Add login flow",
      type: "bug",
      points: 8,
      assigneeId: "jane-d",
    });
  });

  it("handles null assignee", () => {
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({ key: "CV-6", points: 3, assignee: null }),
          changelog: [],
        },
      ],
    });

    expect(result[0].assigneeId).toBeNull();
  });

  it("deduplicates candidates by key (same ticket passed twice)", () => {
    const dup = issue({ key: "CV-7", points: 5 });
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        { issue: dup, changelog: [] },
        { issue: dup, changelog: [] },
      ],
    });

    expect(result).toHaveLength(1);
  });

  it("includes committed tickets even if they got carried out of the sprint mid-week", () => {
    // Regression: prior to the committedKeys bypass, a committed ticket that was moved to a
    // newer sprint before close (and so failed `wasInSprintAt`) was silently dropped from the
    // snapshot — making the close-time roster incomplete and hiding in-progress carry-overs
    // from the retro.
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      committedKeys: new Set(["CV-CARRY"]),
      candidates: [
        {
          issue: issue({ key: "CV-CARRY", points: 5, status: "In Progress" }),
          changelog: [
            sprintChange("2026-05-11T22:00:00Z", "", "40"),
            // Carried over to sprint 41 BEFORE the cutoff — wasInSprintAt would reject it
            // because the latest pre-cutoff sprint value is "41", not "40".
            sprintChange("2026-05-13T05:00:00Z", "40", "41"),
          ],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "CV-CARRY", status: "in-progress", points: 5 });
  });

  it("still gates non-committed candidates (spillover) on wasInSprintAt", () => {
    // Counterpart to the above: a spillover candidate that's no longer in the sprint at close
    // should still be excluded. Only committed keys bypass.
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      committedKeys: new Set(), // CV-SPILL not committed
      candidates: [
        {
          issue: issue({ key: "CV-SPILL", points: 3 }),
          changelog: [
            sprintChange("2026-05-11T22:00:00Z", "", "40"),
            sprintChange("2026-05-13T05:00:00Z", "40", "41"),
          ],
        },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it("rolls a Saturday/Sunday endDate back to the preceding Friday before measuring status", () => {
    // Jira reports sprint endDate as Saturday for many Mon-Fri sprints. The cutoff should be
    // Friday end-of-day Brisbane (= Sat 00:00 Brisbane = Fri 14:00Z), NOT Saturday end-of-day,
    // otherwise weekend cleanup of carried-over work bleeds into the closing-day snapshot.
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-16", // Saturday
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [
        {
          issue: issue({ key: "CV-X", points: 3, status: "peer-review" }),
          changelog: [
            statusChange("2026-05-15T05:00:00Z", "To Do", "In Progress"),
            // Moved to PR after Friday end-of-day Brisbane (= Fri 14:00Z): this transition
            // happens Sat 03:00Z = Sat 13:00 Brisbane, AFTER the rolled-back cutoff.
            statusChange("2026-05-16T03:00:00Z", "In Progress", "Peer Review"),
          ],
        },
      ],
    });

    expect(result[0].status).toBe("in-progress");
  });

  it("returns empty when no candidates", () => {
    const result = buildClosedSprintSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      pointsField: POINTS_FIELD,
      now: NOW,
      candidates: [],
    });

    expect(result).toEqual([]);
  });
});

const snapTicket = (key: string, status: string, points: number): ClosedTicketSnapshot => ({
  sprintId: "40",
  key,
  title: key,
  type: "story",
  status,
  points,
  assigneeId: null,
  capturedAt: NOW,
});

describe("buildClosedSprintBurndownSnapshot", () => {
  it("writes a row at sprint endDate using close-time roster", () => {
    const result = buildClosedSprintBurndownSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      snapshot: [snapTicket("CV-1", "done", 5), snapTicket("CV-2", "in-progress", 3)],
      committedTicketKeys: ["CV-1", "CV-2"],
      now: NOW,
    });

    expect(result).toEqual({
      sprintId: "40",
      forDate: "2026-05-15",
      capturedAt: NOW,
      totalPoints: 8,
      remainingPoints: 3,
      committedRemainingPoints: 3,
    });
  });

  it("anchors actual line to 0 when every committed ticket reached peer-review or beyond", () => {
    const result = buildClosedSprintBurndownSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      snapshot: [
        snapTicket("CV-1", "done", 5),
        snapTicket("CV-2", "peer-review", 3),
        snapTicket("CV-3", "testing", 2),
        snapTicket("CV-4", "closed", 4),
      ],
      committedTicketKeys: ["CV-1", "CV-2", "CV-3", "CV-4"],
      now: NOW,
    });

    expect(result.committedRemainingPoints).toBe(0);
    expect(result.remainingPoints).toBe(0);
  });

  it("excludes uncommitted tickets from committedRemainingPoints (spillover doesn't count)", () => {
    const result = buildClosedSprintBurndownSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      snapshot: [
        snapTicket("CV-1", "in-progress", 5),
        snapTicket("CV-SPILL", "in-progress", 10), // not in committed set
      ],
      committedTicketKeys: ["CV-1"],
      now: NOW,
    });

    expect(result.committedRemainingPoints).toBe(5);
    expect(result.remainingPoints).toBe(15); // unrestricted includes spillover
  });

  it("returns null committedRemainingPoints when sprint had no freeze", () => {
    const result = buildClosedSprintBurndownSnapshot({
      sprintId: "40",
      sprintEndDate: "2026-05-15",
      snapshot: [snapTicket("CV-1", "in-progress", 5)],
      committedTicketKeys: null,
      now: NOW,
    });

    expect(result.committedRemainingPoints).toBeNull();
    expect(result.remainingPoints).toBe(5);
  });
});

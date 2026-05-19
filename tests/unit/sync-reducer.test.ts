import { describe, expect, it } from "vitest";
import { buildSyncWrite } from "@/lib/sync/reducer";
import type { ParsedSprint, ParsedTicket, ParsedAssignee } from "@/lib/jira/parsers";

const sprint = (id: string, name: string): ParsedSprint => ({
  id,
  name,
  state: "active",
  startDate: "2026-05-05",
  startedAt: new Date("2026-05-05T00:00:00+10:00"),
  endDate: "2026-05-18",
  jiraBoardId: "36",
});

const ticket = (
  key: string,
  status: string,
  points: number,
  sprintId: string,
  assigneeId: string | null = null,
): ParsedTicket => ({
  key,
  title: key,
  type: "story",
  status,
  points,
  assigneeId,
  sprintId,
  jiraUpdatedAt: new Date("2026-05-14T00:00:00Z"),
});

describe("buildSyncWrite", () => {
  it("freezes baseline on first sight of a sprint (no prior baselines)", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "in-progress", 5, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].baselinePoints).toBe(8);
    expect(result.sprintUpserts[0].baselineCapturedAt).toEqual(new Date("2026-05-15T12:00:00Z"));
  });

  it("preserves existing baseline on subsequent syncs", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42")],
      assignees: [],
      existingBaselines: new Map([["42", { baselinePoints: 8, baselineCapturedAt: new Date("2026-05-10T00:00:00Z") }]]),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].baselinePoints).toBe(8);
    expect(result.sprintUpserts[0].baselineCapturedAt).toEqual(new Date("2026-05-10T00:00:00Z"));
  });

  it("computes remaining = sum of points in {to-do, blocked, in-progress}", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [
        ticket("CV-1", "to-do", 3, "42"),
        ticket("CV-2", "blocked", 2, "42"),
        ticket("CV-3", "in-progress", 5, "42"),
        ticket("CV-4", "peer-review", 8, "42"),
        ticket("CV-5", "testing", 1, "42"),
        ticket("CV-6", "done", 4, "42"),
        ticket("CV-7", "closed", 7, "42"),
      ],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    const snap = result.burndownSnapshots.find((s) => s.sprintId === "42")!;
    expect(snap.remainingPoints).toBe(10); // 3 + 2 + 5
    expect(snap.totalPoints).toBe(30);     // sum of all
  });

  it("emits one burndown snapshot per synced sprint", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "S42"), sprint("43", "S43")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "to-do", 2, "43")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.burndownSnapshots).toHaveLength(2);
  });

  it("collects ticket keys grouped by sprint for the cleanup set", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "S42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "to-do", 2, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.activeTicketKeys.sort()).toEqual(["CV-1", "CV-2"]);
    expect(result.activeSprintIds).toEqual(["42"]);
  });

  it("freezes committedTicketKeys when caller passes commitmentFreezes and no existing commitment", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "in-progress", 5, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map([["42", ["CV-1", "CV-2"]]]),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].committedTicketKeys).toEqual(["CV-1", "CV-2"]);
    expect(result.sprintUpserts[0].committedCapturedAt).toEqual(new Date("2026-05-15T12:00:00Z"));
  });

  it("preserves existing committedTicketKeys (does not re-freeze)", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "in-progress", 5, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map([
        ["42", { ticketKeys: ["CV-1"], capturedAt: new Date("2026-05-10T00:00:00Z") }],
      ]),
      commitmentFreezes: new Map([["42", ["CV-1", "CV-2"]]]),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].committedTicketKeys).toEqual(["CV-1"]);
    expect(result.sprintUpserts[0].committedCapturedAt).toEqual(new Date("2026-05-10T00:00:00Z"));
  });

  it("leaves committedTicketKeys null when no freeze is requested and no existing commitment", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].committedTicketKeys).toBeNull();
    expect(result.sprintUpserts[0].committedCapturedAt).toBeNull();
  });

  it("snapshot committedRemainingPoints is null when no commitment exists", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "in-progress", 5, "42")],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.burndownSnapshots[0].committedRemainingPoints).toBeNull();
  });

  it("snapshot committedRemainingPoints sums in-status committed tickets when this run freezes the sprint", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [
        ticket("CV-1", "to-do", 3, "42"),       // committed + in-status -> counts (3)
        ticket("CV-2", "in-progress", 5, "42"), // committed + in-status -> counts (5)
        ticket("CV-3", "done", 7, "42"),        // committed but out-of-status -> excluded
        ticket("CV-NEW", "to-do", 9, "42"),     // in-status but NOT committed -> excluded
      ],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map(),
      commitmentFreezes: new Map([["42", ["CV-1", "CV-2", "CV-3"]]]),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.burndownSnapshots[0].committedRemainingPoints).toBe(8); // 3 + 5
    expect(result.burndownSnapshots[0].remainingPoints).toBe(17); // 3 + 5 + 9, unrestricted
  });

  it("snapshot committedRemainingPoints uses the existing commitment when no fresh freeze fires", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [
        ticket("CV-1", "to-do", 3, "42"),
        ticket("CV-NEW", "to-do", 100, "42"),
      ],
      assignees: [],
      existingBaselines: new Map(),
      existingCommitments: new Map([
        ["42", { ticketKeys: ["CV-1"], capturedAt: new Date("2026-05-10T00:00:00Z") }],
      ]),
      commitmentFreezes: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.burndownSnapshots[0].committedRemainingPoints).toBe(3);
  });
});

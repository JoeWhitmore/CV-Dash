import { describe, expect, it } from "vitest";
import { buildSyncWrite } from "@/lib/sync/reducer";
import type { ParsedSprint, ParsedTicket, ParsedAssignee } from "@/lib/jira/parsers";

const sprint = (id: string, name: string): ParsedSprint => ({
  id,
  name,
  state: "active",
  startDate: "2026-05-05",
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
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.sprintUpserts[0].baselinePoints).toBe(8);
    expect(result.sprintUpserts[0].baselineCapturedAt).toEqual(new Date("2026-05-10T00:00:00Z"));
  });

  it("computes remaining = sum of points NOT in {peer-review,testing,done,closed}", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "Sprint 42")],
      tickets: [
        ticket("CV-1", "to-do", 3, "42"),
        ticket("CV-2", "in-progress", 5, "42"),
        ticket("CV-3", "in-review", 2, "42"),
        ticket("CV-4", "peer-review", 8, "42"),
        ticket("CV-5", "testing", 1, "42"),
        ticket("CV-6", "done", 4, "42"),
        ticket("CV-7", "closed", 7, "42"),
      ],
      assignees: [],
      existingBaselines: new Map(),
      now: new Date("2026-05-15T12:00:00Z"),
    });
    const snap = result.burndownSnapshots.find((s) => s.sprintId === "42")!;
    expect(snap.remainingPoints).toBe(10); // 3 + 5 + 2
    expect(snap.totalPoints).toBe(30);     // sum of all
  });

  it("emits one burndown snapshot per synced sprint", () => {
    const result = buildSyncWrite({
      sprints: [sprint("42", "S42"), sprint("43", "S43")],
      tickets: [ticket("CV-1", "to-do", 3, "42"), ticket("CV-2", "to-do", 2, "43")],
      assignees: [],
      existingBaselines: new Map(),
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
      now: new Date("2026-05-15T12:00:00Z"),
    });
    expect(result.activeTicketKeys.sort()).toEqual(["CV-1", "CV-2"]);
    expect(result.activeSprintIds).toEqual(["42"]);
  });
});

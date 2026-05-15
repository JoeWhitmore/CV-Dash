import { describe, expect, it } from "vitest";
import { statusAtTime, wasInSprintAt } from "@/lib/jira/sprint-history";
import type { JiraChangelogEntry } from "@/lib/jira/types";

const statusChange = (created: string, from: string, to: string): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "status", from, fromString: from, to, toString: to }],
});

const sprintChange = (
  created: string,
  from: string,
  to: string,
): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "Sprint", from, fromString: from, to, toString: to }],
});

const noise = (created: string): JiraChangelogEntry => ({
  id: created,
  created,
  items: [{ field: "status", from: "1", fromString: "Open", to: "3", toString: "In Progress" }],
});

const cutoff = new Date("2026-05-04T22:00:00Z"); // Monday 8AM Brisbane for sprint starting 2026-05-04

describe("wasInSprintAt", () => {
  it("returns true when no changelog entries and issue was created before cutoff (always in)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-05-01T00:00:00Z",
        changelog: [],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("returns false when issue was created after cutoff", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-05-06T00:00:00Z",
        changelog: [],
        at: cutoff,
      }),
    ).toBe(false);
  });

  it("respects the last Sprint change before cutoff (in -> out)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [sprintChange("2026-05-03T10:00:00Z", "42", "")],
        at: cutoff,
      }),
    ).toBe(false);
  });

  it("respects the last Sprint change before cutoff (out -> in)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [sprintChange("2026-05-03T10:00:00Z", "41", "42")],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("ignores Sprint changes after cutoff", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [
          sprintChange("2026-05-03T10:00:00Z", "41", "42"),
          sprintChange("2026-05-05T10:00:00Z", "42", ""),
        ],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("handles multi-sprint values (comma-separated)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [sprintChange("2026-05-03T10:00:00Z", "41", "41, 42")],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("ignores non-Sprint changelog items", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [noise("2026-05-03T10:00:00Z")],
        at: cutoff,
      }),
    ).toBe(true);
  });

  it("uses the LATEST Sprint change before cutoff (not the first)", () => {
    expect(
      wasInSprintAt({
        sprintId: "42",
        issueCreated: "2026-04-01T00:00:00Z",
        changelog: [
          sprintChange("2026-05-02T10:00:00Z", "", "42"),
          sprintChange("2026-05-03T10:00:00Z", "42", ""),
        ],
        at: cutoff,
      }),
    ).toBe(false);
  });
});

describe("statusAtTime", () => {
  const at = new Date("2026-05-12T22:00:00Z");

  it("returns currentStatus when changelog has no status transitions at all", () => {
    expect(
      statusAtTime({ currentStatus: "to-do", changelog: [], at }),
    ).toBe("to-do");
  });

  it("returns the latest pre-cutoff status transition (mapped)", () => {
    expect(
      statusAtTime({
        currentStatus: "done",
        changelog: [
          statusChange("2026-05-11T10:00:00Z", "To Do", "In Progress"),
          statusChange("2026-05-12T10:00:00Z", "In Progress", "Peer Review"),
          statusChange("2026-05-13T10:00:00Z", "Peer Review", "Done"), // after `at`
        ],
        at,
      }),
    ).toBe("peer-review");
  });

  it("returns the FIRST transition's fromString when all transitions happen after `at`", () => {
    expect(
      statusAtTime({
        currentStatus: "in-progress",
        changelog: [
          statusChange("2026-05-13T10:00:00Z", "To Do", "In Progress"),
          statusChange("2026-05-14T10:00:00Z", "In Progress", "Peer Review"),
        ],
        at,
      }),
    ).toBe("to-do");
  });

  it("ignores non-status changelog items", () => {
    expect(
      statusAtTime({
        currentStatus: "to-do",
        changelog: [
          { id: "x", created: "2026-05-11T10:00:00Z", items: [{ field: "Sprint", from: "", fromString: "", to: "42", toString: "42" }] },
        ],
        at,
      }),
    ).toBe("to-do");
  });
});

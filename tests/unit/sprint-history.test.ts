import { describe, expect, it } from "vitest";
import { wasInSprintAt } from "@/lib/jira/sprint-history";
import type { JiraChangelogEntry } from "@/lib/jira/types";

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

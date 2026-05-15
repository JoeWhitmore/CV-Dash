import { describe, expect, it } from "vitest";
import { statusAtTime } from "@/lib/jira/status-history";
import type { JiraChangelogEntry } from "@/lib/jira/types";

const entry = (created: string, from: string, to: string): JiraChangelogEntry => ({
  id: `${created}-${to}`,
  created,
  items: [
    {
      field: "status",
      fieldtype: "jira",
      from: null,
      to: null,
      fromString: from,
      toString: to,
    },
  ],
});

describe("statusAtTime", () => {
  it("returns currentStatus when no changes happened after the target time", () => {
    const result = statusAtTime({
      changelog: [entry("2026-05-11T03:00:00Z", "To Do", "In Progress")],
      currentStatus: "Peer review",
      at: new Date("2026-05-15T08:00:00Z"),
    });
    expect(result).toBe("Peer review");
  });

  it("returns fromString of the earliest future status change", () => {
    const result = statusAtTime({
      changelog: [
        entry("2026-05-12T03:00:00Z", "To Do", "In Progress"),
        entry("2026-05-13T03:00:00Z", "In Progress", "In Review"),
        entry("2026-05-14T03:00:00Z", "In Review", "Peer review"),
      ],
      currentStatus: "Done",
      at: new Date("2026-05-12T12:00:00Z"),
    });
    // Earliest change after 05-12 12:00 is 05-13's "In Progress → In Review".
    // The status AT 05-12 12:00 is its fromString: "In Progress".
    expect(result).toBe("In Progress");
  });

  it("ignores non-status field changes", () => {
    const sprintEntry: JiraChangelogEntry = {
      id: "s",
      created: "2026-05-13T03:00:00Z",
      items: [{ field: "Sprint", fieldtype: "custom", from: null, to: null, fromString: "1649", toString: "1650" }],
    };
    const result = statusAtTime({
      changelog: [sprintEntry],
      currentStatus: "Done",
      at: new Date("2026-05-12T12:00:00Z"),
    });
    expect(result).toBe("Done"); // no future status change → currentStatus
  });

  it("handles empty changelog", () => {
    const result = statusAtTime({
      changelog: [],
      currentStatus: "To Do",
      at: new Date("2026-05-12T00:00:00Z"),
    });
    expect(result).toBe("To Do");
  });
});

import { describe, expect, it } from "vitest";
import { filterInScope, isComplete, isInScope } from "@/lib/scope";
import type { Ticket } from "@/lib/types";

const t = (status: Ticket["status"]): Ticket => ({
  key: "CV-1",
  title: "x",
  type: "task",
  status,
  points: 1,
  assigneeId: "joe-w",
});

describe("isInScope", () => {
  it.each([
    ["to-do", true],
    ["in-progress", true],
    ["in-review", true],
    ["peer-review", true],
    ["testing", false],
    ["done", false],
    ["closed", false],
  ] as const)("status=%s -> %s", (status, expected) => {
    expect(isInScope(t(status))).toBe(expected);
  });
});

describe("isComplete", () => {
  it("returns true only for peer-review", () => {
    expect(isComplete(t("peer-review"))).toBe(true);
    expect(isComplete(t("in-review"))).toBe(false);
    expect(isComplete(t("done"))).toBe(false);
  });
});

describe("filterInScope", () => {
  it("keeps only in-scope tickets", () => {
    const tickets = [t("to-do"), t("done"), t("peer-review"), t("testing")];
    expect(filterInScope(tickets)).toHaveLength(2);
  });
});

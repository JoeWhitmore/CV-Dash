import { describe, expect, it } from "vitest";
import { projectBurndown } from "@/lib/burndown";

describe("projectBurndown", () => {
  it("emits one point per snapshot plus an end-date anchor, with computed ideals", () => {
    const result = projectBurndown({
      sprint: { startDate: "2026-05-05", endDate: "2026-05-18", baselinePoints: 30 },
      snapshots: [
        { capturedAt: new Date("2026-05-05T09:00:00Z"), remainingPoints: 30 },
        { capturedAt: new Date("2026-05-08T09:00:00Z"), remainingPoints: 24 },
        { capturedAt: new Date("2026-05-12T09:00:00Z"), remainingPoints: 18 },
      ],
    });
    // 3 snapshots (start-date snapshot replaces the start anchor) + end-date anchor
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ date: "2026-05-05", remaining: 30, ideal: 30 });
    expect(result[2]).toMatchObject({ date: "2026-05-12", remaining: 18 });
    expect(result[2].ideal).toBeLessThan(30);
    expect(result[2].ideal).toBeGreaterThan(0);
    expect(result[3]).toMatchObject({ date: "2026-05-18", remaining: null, ideal: 0 });
  });

  it("returns empty array when sprint has no dates", () => {
    expect(
      projectBurndown({
        sprint: { startDate: null, endDate: null, baselinePoints: 0 },
        snapshots: [],
      }),
    ).toEqual([]);
  });

  it("anchors the actual line at baseline on sprint start so it's visible from day 1", () => {
    // Sprint started 05-10, today is 05-15, one snapshot only. The actual line should
    // connect (start, baseline) → (snapshot date, snapshot remaining), not be hidden because
    // the only valid datum is one snapshot.
    const result = projectBurndown({
      sprint: { startDate: "2026-05-10", endDate: "2026-05-17", baselinePoints: 625 },
      snapshots: [{ capturedAt: new Date("2026-05-15T05:52:00Z"), remainingPoints: 110 }],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ date: "2026-05-10", remaining: 625, ideal: 625 });
    expect(result[1]).toMatchObject({ date: "2026-05-15", remaining: 110 });
    expect(result[2]).toMatchObject({ date: "2026-05-17", remaining: null, ideal: 0 });
  });

  it("emits an ideal + baseline-anchored actual line for sprints with no snapshots", () => {
    const result = projectBurndown({
      sprint: { startDate: "2026-06-01", endDate: "2026-06-14", baselinePoints: 40 },
      snapshots: [],
    });
    expect(result).toEqual([
      { date: "2026-06-01", remaining: 40, ideal: 40 },
      { date: "2026-06-14", remaining: null, ideal: 0 },
    ]);
  });
});

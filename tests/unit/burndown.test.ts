import { describe, expect, it } from "vitest";
import { projectBurndown } from "@/lib/burndown";

// Helpers to keep tests focused on intent; defaults set the freeze-mode fields to null.
const sprint = (overrides: {
  startDate: string | null;
  endDate: string | null;
  baselinePoints: number | null;
  committedBaselinePoints?: number | null;
}) => ({
  committedBaselinePoints: null,
  ...overrides,
});
const snap = (forDate: string, remainingPoints: number, committedRemainingPoints: number | null = null) => ({
  forDate,
  remainingPoints,
  committedRemainingPoints,
});

describe("projectBurndown", () => {
  it("emits one entry per working day (Mon-Fri); ideal drops linearly from baseline to 0", () => {
    const result = projectBurndown({
      sprint: sprint({ startDate: "2026-05-11", endDate: "2026-05-15", baselinePoints: 40 }),
      snapshots: [],
    });
    expect(result.map((p) => p.date)).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ]);
    expect(result[0]).toMatchObject({ date: "2026-05-11", remaining: null, ideal: 40 });
    expect(result[4]).toMatchObject({ date: "2026-05-15", remaining: null, ideal: 0 });
    expect(result[2].ideal).toBe(20);
  });

  it("skips weekends entirely — Sat/Sun never appear on the chart", () => {
    const result = projectBurndown({
      sprint: sprint({ startDate: "2026-05-10", endDate: "2026-05-17", baselinePoints: 625 }),
      snapshots: [],
    });
    expect(result.map((p) => p.date)).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ]);
  });

  it("overlays per-day snapshots; one snapshot per working day", () => {
    const result = projectBurndown({
      sprint: sprint({ startDate: "2026-05-11", endDate: "2026-05-15", baselinePoints: 40 }),
      snapshots: [
        snap("2026-05-11", 40),
        snap("2026-05-12", 35),
        snap("2026-05-13", 24),
        snap("2026-05-15", 18),
      ],
    });
    expect(result.find((p) => p.date === "2026-05-11")?.remaining).toBe(40);
    expect(result.find((p) => p.date === "2026-05-12")?.remaining).toBe(35);
    expect(result.find((p) => p.date === "2026-05-13")?.remaining).toBe(24);
    expect(result.find((p) => p.date === "2026-05-14")?.remaining).toBeNull();
    expect(result.find((p) => p.date === "2026-05-15")?.remaining).toBe(18);
  });

  it("rolls weekend-dated snapshots back to the previous Friday", () => {
    const result = projectBurndown({
      sprint: sprint({ startDate: "2026-05-11", endDate: "2026-05-22", baselinePoints: 100 }),
      snapshots: [snap("2026-05-16", 60)],
    });
    const fri = result.find((p) => p.date === "2026-05-15")!;
    expect(fri.remaining).toBe(60);
    expect(result.find((p) => p.date === "2026-05-16")).toBeUndefined();
  });

  it("returns [] when sprint has no dates", () => {
    expect(
      projectBurndown({
        sprint: sprint({ startDate: null, endDate: null, baselinePoints: 0 }),
        snapshots: [],
      }),
    ).toEqual([]);
  });

  it("returns [] when sprint window contains no weekdays", () => {
    expect(
      projectBurndown({
        sprint: sprint({ startDate: "2026-05-16", endDate: "2026-05-17", baselinePoints: 10 }),
        snapshots: [],
      }),
    ).toEqual([]);
  });

  it("when committedBaselinePoints is set, ideal line uses it (not the unrestricted baseline)", () => {
    const result = projectBurndown({
      sprint: sprint({
        startDate: "2026-05-11",
        endDate: "2026-05-15",
        baselinePoints: 625, // total of all tickets — should be ignored
        committedBaselinePoints: 200, // committed-only — should drive the ideal
      }),
      snapshots: [],
    });
    expect(result[0].ideal).toBe(200);
    expect(result[4].ideal).toBe(0);
    expect(result[2].ideal).toBe(100);
  });

  it("when committed mode is active, actual line uses snapshots' committedRemainingPoints (not the unrestricted figure)", () => {
    const result = projectBurndown({
      sprint: sprint({
        startDate: "2026-05-11",
        endDate: "2026-05-15",
        baselinePoints: 625,
        committedBaselinePoints: 200,
      }),
      snapshots: [
        snap("2026-05-11", 600, 195), // unrestricted 600, committed-only 195
        snap("2026-05-13", 400, 120),
      ],
    });
    expect(result.find((p) => p.date === "2026-05-11")?.remaining).toBe(195);
    expect(result.find((p) => p.date === "2026-05-13")?.remaining).toBe(120);
  });

  it("when committed mode is active, snapshots that predate the freeze (committedRemainingPoints null) are skipped (no scope mixing)", () => {
    const result = projectBurndown({
      sprint: sprint({
        startDate: "2026-05-11",
        endDate: "2026-05-15",
        baselinePoints: 625,
        committedBaselinePoints: 200,
      }),
      snapshots: [
        snap("2026-05-11", 600, null), // pre-freeze snapshot — must not be plotted
        snap("2026-05-13", 400, 120),
      ],
    });
    expect(result.find((p) => p.date === "2026-05-11")?.remaining).toBeNull();
    expect(result.find((p) => p.date === "2026-05-13")?.remaining).toBe(120);
  });
});

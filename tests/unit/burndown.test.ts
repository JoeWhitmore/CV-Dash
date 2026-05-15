import { describe, expect, it } from "vitest";
import { projectBurndown } from "@/lib/burndown";

describe("projectBurndown", () => {
  it("emits one entry per working day (Mon-Fri); ideal drops linearly from baseline to 0", () => {
    const result = projectBurndown({
      sprint: { startDate: "2026-05-11", endDate: "2026-05-15", baselinePoints: 40 },
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
      sprint: { startDate: "2026-05-10", endDate: "2026-05-17", baselinePoints: 625 },
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
      sprint: { startDate: "2026-05-11", endDate: "2026-05-15", baselinePoints: 40 },
      snapshots: [
        { forDate: "2026-05-11", remainingPoints: 40 },
        { forDate: "2026-05-12", remainingPoints: 35 },
        { forDate: "2026-05-13", remainingPoints: 24 },
        { forDate: "2026-05-15", remainingPoints: 18 },
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
      sprint: { startDate: "2026-05-11", endDate: "2026-05-22", baselinePoints: 100 },
      snapshots: [{ forDate: "2026-05-16", remainingPoints: 60 }],
    });
    const fri = result.find((p) => p.date === "2026-05-15")!;
    expect(fri.remaining).toBe(60);
    expect(result.find((p) => p.date === "2026-05-16")).toBeUndefined();
  });

  it("returns [] when sprint has no dates", () => {
    expect(
      projectBurndown({
        sprint: { startDate: null, endDate: null, baselinePoints: 0 },
        snapshots: [],
      }),
    ).toEqual([]);
  });

  it("returns [] when sprint window contains no weekdays", () => {
    expect(
      projectBurndown({
        sprint: { startDate: "2026-05-16", endDate: "2026-05-17", baselinePoints: 10 },
        snapshots: [],
      }),
    ).toEqual([]);
  });
});

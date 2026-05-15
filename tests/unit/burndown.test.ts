import { describe, expect, it } from "vitest";
import { projectBurndown } from "@/lib/burndown";

describe("projectBurndown", () => {
  it("emits one entry per working day (Mon-Fri), ideal drops linearly from baseline to 0", () => {
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
    expect(result[0]).toMatchObject({ date: "2026-05-11", remaining: 40, ideal: 40 });
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

  it("overlays snapshots on the matching working day; preserves the working-day ideal", () => {
    const result = projectBurndown({
      sprint: { startDate: "2026-05-11", endDate: "2026-05-15", baselinePoints: 40 },
      snapshots: [
        { capturedAt: new Date("2026-05-13T09:00:00Z"), remainingPoints: 24 },
        { capturedAt: new Date("2026-05-15T09:00:00Z"), remainingPoints: 18 },
      ],
    });
    const wed = result.find((p) => p.date === "2026-05-13")!;
    const fri = result.find((p) => p.date === "2026-05-15")!;
    expect(wed.remaining).toBe(24);
    expect(wed.ideal).toBe(20);
    expect(fri.remaining).toBe(18);
    expect(fri.ideal).toBe(0);
  });

  it("rolls weekend-captured snapshots back to the previous Friday", () => {
    const result = projectBurndown({
      sprint: { startDate: "2026-05-11", endDate: "2026-05-22", baselinePoints: 100 },
      snapshots: [{ capturedAt: new Date("2026-05-16T11:00:00Z"), remainingPoints: 60 }],
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

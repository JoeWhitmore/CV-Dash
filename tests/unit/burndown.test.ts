import { describe, expect, it } from "vitest";
import { projectBurndown } from "@/lib/burndown";

describe("projectBurndown", () => {
  it("emits one point per snapshot, computed ideal from sprint dates and baseline", () => {
    const result = projectBurndown({
      sprint: { startDate: "2026-05-05", endDate: "2026-05-18", baselinePoints: 30 },
      snapshots: [
        { capturedAt: new Date("2026-05-05T09:00:00Z"), remainingPoints: 30 },
        { capturedAt: new Date("2026-05-08T09:00:00Z"), remainingPoints: 24 },
        { capturedAt: new Date("2026-05-12T09:00:00Z"), remainingPoints: 18 },
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ date: "2026-05-05", remaining: 30 });
    expect(result[2]).toMatchObject({ date: "2026-05-12", remaining: 18 });
    // ideal: linear from 30 → 0 across full sprint span (13 calendar days inclusive)
    expect(result[0].ideal).toBe(30);
    expect(result[2].ideal).toBeLessThan(30);
    expect(result[2].ideal).toBeGreaterThan(0);
  });

  it("returns empty array when sprint has no dates or no snapshots", () => {
    expect(
      projectBurndown({
        sprint: { startDate: null, endDate: null, baselinePoints: 0 },
        snapshots: [],
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { workingDaysBetween } from "@/lib/working-days";

describe("workingDaysBetween", () => {
  it("counts Mon-Fri only, inclusive of both endpoints", () => {
    // Mon 2026-05-04 to Fri 2026-05-08 = 5 working days
    expect(workingDaysBetween("2026-05-04", "2026-05-08")).toBe(5);
  });

  it("excludes weekends", () => {
    // Sat 2026-05-09 to Sun 2026-05-10 = 0 working days
    expect(workingDaysBetween("2026-05-09", "2026-05-10")).toBe(0);
  });

  it("returns 0 when end is before start", () => {
    expect(workingDaysBetween("2026-05-10", "2026-05-04")).toBe(0);
  });

  it("counts a single working day as 1", () => {
    expect(workingDaysBetween("2026-05-14", "2026-05-14")).toBe(1);
  });

  it("clamps to 0 (not negative) for past end dates", () => {
    expect(workingDaysBetween("2026-05-20", "2026-05-14")).toBe(0);
  });
});

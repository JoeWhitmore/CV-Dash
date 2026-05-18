import { describe, expect, it } from "vitest";
import { committedCutoff } from "@/lib/sprint/cutoff";

describe("committedCutoff", () => {
  it("returns sprint startDate at 00:00 Brisbane (UTC+10) as a UTC Date", () => {
    // 2026-05-04 00:00 +10:00 == 2026-05-03 14:00 UTC
    expect(committedCutoff("2026-05-04")).toEqual(new Date("2026-05-03T14:00:00Z"));
  });

  it("returns null when startDate is null", () => {
    expect(committedCutoff(null)).toBeNull();
  });

  it("returns null when startDate is empty string", () => {
    expect(committedCutoff("")).toBeNull();
  });

  it("handles a Sunday startDate at midnight Brisbane (no roll-forward to Monday)", () => {
    // Sprint 41 case: Jira reports startDate = Sun 2026-05-17 (sprint activated Sun).
    // We use that literal moment — no Mon 8AM adjustment.
    // 2026-05-17 00:00 +10:00 == 2026-05-16 14:00 UTC
    expect(committedCutoff("2026-05-17")).toEqual(new Date("2026-05-16T14:00:00Z"));
  });

  it("handles year-end dates without DST drift (Brisbane has no DST)", () => {
    // 2026-12-28 00:00 +10:00 == 2026-12-27 14:00 UTC
    expect(committedCutoff("2026-12-28")).toEqual(new Date("2026-12-27T14:00:00Z"));
  });
});

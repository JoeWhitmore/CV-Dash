import { describe, expect, it } from "vitest";
import { committedCutoff } from "@/lib/sprint/cutoff";

describe("committedCutoff", () => {
  it("returns sprint start date at 08:00 Brisbane (UTC+10) as a UTC Date", () => {
    // 2026-05-04 08:00 +10:00 == 2026-05-03 22:00 UTC
    expect(committedCutoff("2026-05-04")).toEqual(new Date("2026-05-03T22:00:00Z"));
  });

  it("returns null when startDate is null", () => {
    expect(committedCutoff(null)).toBeNull();
  });

  it("returns null when startDate is empty string", () => {
    expect(committedCutoff("")).toBeNull();
  });

  it("handles year-end dates without DST drift (Brisbane has no DST)", () => {
    // 2026-12-28 08:00 +10:00 == 2026-12-27 22:00 UTC
    expect(committedCutoff("2026-12-28")).toEqual(new Date("2026-12-27T22:00:00Z"));
  });
});

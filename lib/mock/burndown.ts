import type { BurndownPoint } from "@/lib/types";

// Sprint 42: 2026-05-05 (Tue) -> 2026-05-18 (Mon). Working days only.
// Ideal line drops linearly from 33 to 0 across the working-day timeline.
// Actual is a step pattern that reaches 26 today (2026-05-14).
const COMMITTED = 33;
const WORKING_DAYS = [
  "2026-05-05",
  "2026-05-06",
  "2026-05-07",
  "2026-05-08", // wk 1: Tue-Fri
  "2026-05-11",
  "2026-05-12",
  "2026-05-13",
  "2026-05-14",
  "2026-05-15", // wk 2: Mon-Fri
  "2026-05-18", // wk 3: Mon (last day)
];

const ACTUAL_REMAINING = [33, 33, 31, 30, 28, 28, 27, 26, /* future */ 26, 26];

export const burndownBySprint: Record<string, BurndownPoint[]> = {
  "sprint-42": WORKING_DAYS.map((date, i) => ({
    date,
    remaining: ACTUAL_REMAINING[i],
    ideal: Math.round((COMMITTED * (WORKING_DAYS.length - 1 - i)) / (WORKING_DAYS.length - 1)),
  })),
};

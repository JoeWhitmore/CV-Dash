import { describe, expect, it } from "vitest";
import { sprintKpis } from "@/lib/kpi";
import type { Sprint, Ticket } from "@/lib/types";

const ticket = (key: string, status: Ticket["status"], points: number): Ticket => ({
  key,
  title: "x",
  type: "task",
  status,
  points,
  assigneeId: "joe-w",
});

const sprint: Sprint = {
  id: "s1",
  name: "S1",
  startDate: "2026-05-05",
  endDate: "2026-05-18",
  ticketKeys: ["CV-1", "CV-2", "CV-3", "CV-4", "CV-5"],
  committedTicketKeys: null,
};

describe("sprintKpis", () => {
  it("sums points for in-scope tickets, ignores out-of-scope", () => {
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "in-progress", 5),
      ticket("CV-3", "peer-review", 2),
      ticket("CV-4", "done", 100), // ignored
      ticket("CV-5", "testing", 100), // ignored
    ];
    const today = "2026-05-14";
    const kpis = sprintKpis(sprint, tickets, today);

    expect(kpis.pointsCommitted).toBe(10);
    expect(kpis.pointsToPr).toBe(2);
    expect(kpis.percentComplete).toBe(20);
    // 2026-05-14 (Thu) -> 2026-05-18 (Mon) inclusive = Thu, Fri, Mon = 3 working days
    expect(kpis.daysRemaining).toBe(3);
  });

  it("returns 0% complete when committed is 0", () => {
    const kpis = sprintKpis(sprint, [], "2026-05-14");
    expect(kpis.pointsCommitted).toBe(0);
    expect(kpis.percentComplete).toBe(0);
  });

  it("clamps daysRemaining to 0 after sprint end", () => {
    const tickets = [ticket("CV-1", "to-do", 3)];
    const kpis = sprintKpis(sprint, tickets, "2026-06-01");
    expect(kpis.daysRemaining).toBe(0);
  });

  it("when committedTicketKeys is set, pointsCommitted ignores tickets outside the committed list", () => {
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2", "CV-SPILLOVER"],
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "in-progress", 5),
      ticket("CV-SPILLOVER", "in-progress", 8),
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(8);
  });

  it("when committedTicketKeys is set, re-estimates of committed tickets still count", () => {
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2"],
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "to-do", 5),
      ticket("CV-2", "in-progress", 13),
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(18);
  });

  it("when committedTicketKeys is null, falls back to in-scope sum", () => {
    const sprintWithoutFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2"],
      committedTicketKeys: null,
    };
    const tickets = [ticket("CV-1", "to-do", 3), ticket("CV-2", "in-progress", 5)];
    const kpis = sprintKpis(sprintWithoutFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(8);
  });
});

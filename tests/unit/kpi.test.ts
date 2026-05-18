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
  it("sums all sprint points; pointsToPr counts every status from peer-review onward", () => {
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "in-progress", 5),
      ticket("CV-3", "peer-review", 2),
      ticket("CV-4", "done", 100),
      ticket("CV-5", "testing", 100),
    ];
    const today = "2026-05-14";
    const kpis = sprintKpis(sprint, tickets, today);

    // No freeze on this sprint — pointsCommitted is the full sprint scope (210),
    // pointsToPr counts every ticket whose status is peer-review/testing/done/closed (202).
    expect(kpis.pointsCommitted).toBe(210);
    expect(kpis.pointsToPr).toBe(202);
    expect(kpis.percentComplete).toBe(96.2);
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
      ticket("CV-SPILLOVER", "in-progress", 99),
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

  it("when committedTicketKeys is null, falls back to summing every sprint ticket", () => {
    const sprintWithoutFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2", "CV-3"],
      committedTicketKeys: null,
    };
    // Includes a 'done' ticket that the old in-scope filter would have dropped.
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "in-progress", 5),
      ticket("CV-3", "done", 7),
    ];
    const kpis = sprintKpis(sprintWithoutFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(15);
  });

  it("when committedTicketKeys is set, committed tickets that have moved to done still count (commitment is constant)", () => {
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2"],
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "to-do", 3),
      ticket("CV-2", "done", 5), // moved out of scope but stays in committed
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(8);
  });

  it("when committedTicketKeys is set, pointsToPr only counts peer-review tickets that are in the committed list", () => {
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2", "CV-NEW"],
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "peer-review", 3),    // committed + at PR -> counts (3)
      ticket("CV-2", "in-progress", 5),    // committed but not at PR
      ticket("CV-NEW", "peer-review", 99), // at PR but not committed -> excluded
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsToPr).toBe(3);
    expect(kpis.pointsCommitted).toBe(8);
    // 3 / 8 = 37.5%
    expect(kpis.percentComplete).toBe(37.5);
  });

  it("when a committed ticket is removed from the sprint after freeze, it still counts as committed", () => {
    // Regression: previously the scope was (current sprint members) ∩ (committed set),
    // so a committed ticket later removed from the sprint dropped out of both numerator
    // and denominator — pinning percentComplete at 100%.
    const sprintWithFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1"], // CV-2 was removed from the sprint after Monday 8am freeze
      committedTicketKeys: ["CV-1", "CV-2"],
    };
    const tickets = [
      ticket("CV-1", "done", 3),
      ticket("CV-2", "to-do", 5), // committed but no longer in sprint
    ];
    const kpis = sprintKpis(sprintWithFreeze, tickets, "2026-05-14");
    expect(kpis.pointsCommitted).toBe(8);
    expect(kpis.pointsToPr).toBe(3);
    expect(kpis.percentComplete).toBe(37.5);
  });

  it("when committedTicketKeys is null, pointsToPr counts every sprint ticket past peer-review", () => {
    const sprintWithoutFreeze: Sprint = {
      ...sprint,
      ticketKeys: ["CV-1", "CV-2", "CV-3", "CV-4"],
      committedTicketKeys: null,
    };
    const tickets = [
      ticket("CV-1", "peer-review", 3),
      ticket("CV-2", "testing", 5),
      ticket("CV-3", "done", 7),
      ticket("CV-4", "to-do", 999), // not yet at PR
    ];
    const kpis = sprintKpis(sprintWithoutFreeze, tickets, "2026-05-14");
    expect(kpis.pointsToPr).toBe(15);
  });
});

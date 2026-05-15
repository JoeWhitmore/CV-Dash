import { describe, expect, it } from "vitest";
import { deriveTeam } from "@/lib/sync/team-derivation";
import type { ParsedAssignee } from "@/lib/jira/parsers";

const make = (id: string, accountId: string, name: string): ParsedAssignee => ({
  id,
  jiraAccountId: accountId,
  name,
  initials: name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase(),
  avatarUrl: null,
});

describe("deriveTeam", () => {
  it("returns unique team members keyed by jiraAccountId", () => {
    const result = deriveTeam([
      make("joe-w", "acc-1", "Joe Whitmore"),
      make("joe-w", "acc-1", "Joe Whitmore"), // duplicate
      make("priya-s", "acc-2", "Priya Singh"),
      null,
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.jiraAccountId).sort()).toEqual(["acc-1", "acc-2"]);
  });

  it("disambiguates slug collisions between different accountIds", () => {
    const result = deriveTeam([
      make("joe-w", "acc-1", "Joe Whitmore"),
      make("joe-w", "acc-2", "Joe Williams"),
      make("joe-w", "acc-3", "Joe Watson"),
    ]);
    const ids = result.map((m) => m.id).sort();
    expect(ids).toEqual(["joe-w", "joe-w-2", "joe-w-3"]);
  });

  it("is stable: same accountId always gets same id within a single derivation", () => {
    const result = deriveTeam([
      make("joe-w", "acc-1", "Joe Whitmore"),
      make("joe-w", "acc-2", "Joe Williams"),
      make("joe-w", "acc-1", "Joe Whitmore"),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.jiraAccountId === "acc-1")?.id).toBe("joe-w");
    expect(result.find((m) => m.jiraAccountId === "acc-2")?.id).toBe("joe-w-2");
  });
});

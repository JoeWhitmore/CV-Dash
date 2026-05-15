import type { ParsedAssignee } from "@/lib/jira/parsers";

export interface DerivedTeamMember {
  id: string;
  jiraAccountId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
}

export function deriveTeam(
  assignees: Array<ParsedAssignee | null>,
): DerivedTeamMember[] {
  const byAccount = new Map<string, DerivedTeamMember>();
  const usedIds = new Map<string, string>(); // baseSlug → accountId who got the un-suffixed slug

  for (const a of assignees) {
    if (!a) continue;
    if (byAccount.has(a.jiraAccountId)) continue;

    let finalId = a.id;
    if (usedIds.has(a.id) && usedIds.get(a.id) !== a.jiraAccountId) {
      let counter = 2;
      while (true) {
        const candidate = `${a.id}-${counter}`;
        const taken = Array.from(byAccount.values()).some((m) => m.id === candidate);
        if (!taken) {
          finalId = candidate;
          break;
        }
        counter++;
      }
    } else {
      usedIds.set(a.id, a.jiraAccountId);
    }

    byAccount.set(a.jiraAccountId, {
      id: finalId,
      jiraAccountId: a.jiraAccountId,
      name: a.name,
      initials: a.initials,
      avatarUrl: a.avatarUrl,
    });
  }

  return Array.from(byAccount.values());
}

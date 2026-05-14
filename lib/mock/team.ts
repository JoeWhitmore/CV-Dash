import type { TeamMember } from "@/lib/types";

export const team: TeamMember[] = [
  { id: "joe-w", name: "Joe Whitmore", initials: "JW" },
  { id: "alex-k", name: "Alex Kim", initials: "AK" },
  { id: "priya-s", name: "Priya Singh", initials: "PS" },
  { id: "sam-l", name: "Sam Lopez", initials: "SL" },
  { id: "noor-h", name: "Noor Hassan", initials: "NH" },
  { id: "rachel-b", name: "Rachel Brooks", initials: "RB" },
  { id: "dan-r", name: "Dan Reilly", initials: "DR" },
  { id: "mia-t", name: "Mia Tanaka", initials: "MT" },
];

export const teamById: Record<string, TeamMember> = Object.fromEntries(
  team.map((member) => [member.id, member]),
);

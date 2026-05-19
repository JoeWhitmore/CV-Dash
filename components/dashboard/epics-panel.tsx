"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Stage definitions: id (slug, used in state/URLs), jiraStatus (exact Jira spelling
// for querying), label (what users see in the app).
export const EPIC_STAGES = [
  { id: "discovery", jiraStatus: "Discovery", label: "To Do" },
  { id: "planned", jiraStatus: "Planned", label: "Scoped" },
  { id: "design", jiraStatus: "Design", label: "In Design" },
  { id: "building", jiraStatus: "Building", label: "Building" },
  { id: "pr", jiraStatus: "PR", label: "Peer Review" },
  { id: "in-qa", jiraStatus: "In QA", label: "QA" },
  { id: "design-review", jiraStatus: "Design Review", label: "Design Review" },
  { id: "ready-for-release", jiraStatus: "Ready for Release", label: "Ready for Release" },
  { id: "done", jiraStatus: "Done", label: "Done" },
] as const;

export type EpicStageId = (typeof EPIC_STAGES)[number]["id"];

export function jiraStatusToStageId(status: string): EpicStageId | null {
  const stage = EPIC_STAGES.find((s) => s.jiraStatus === status);
  return stage?.id ?? null;
}

export interface EpicAssignee {
  id: string;
  name: string;
  initials: string;
}

export interface EpicSummary {
  key: string;
  title: string;
  stage: EpicStageId;
  ticketCount: number;
  assignees: EpicAssignee[];
}

interface Props {
  epics: EpicSummary[];
  initialStage?: EpicStageId;
}

export function EpicsPanel({ epics, initialStage = "building" }: Props) {
  const [selectedStage, setSelectedStage] = useState<EpicStageId>(initialStage);
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const countsByStage = useMemo(() => {
    const counts = Object.fromEntries(EPIC_STAGES.map((s) => [s.id, 0])) as Record<
      EpicStageId,
      number
    >;
    for (const e of epics) counts[e.stage]++;
    return counts;
  }, [epics]);

  const matches = useMemo(() => {
    if (!isSearching) return epics.filter((e) => e.stage === selectedStage);
    return epics.filter(
      (e) => e.title.toLowerCase().includes(trimmed) || e.key.toLowerCase().includes(trimmed),
    );
  }, [epics, isSearching, trimmed, selectedStage]);

  const sections = useMemo(() => {
    if (!isSearching) {
      const stage = EPIC_STAGES.find((s) => s.id === selectedStage);
      return stage ? [{ id: stage.id, label: stage.label, items: matches }] : [];
    }
    return EPIC_STAGES.map((s) => ({
      id: s.id,
      label: s.label,
      items: matches.filter((e) => e.stage === s.id),
    })).filter((s) => s.items.length > 0);
  }, [matches, isSearching, selectedStage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search epics by key or title…"
          className="pl-9"
          aria-label="Search epics"
        />
      </div>

      <ToggleGroup
        value={[selectedStage]}
        onValueChange={(v) => {
          const next = v[0];
          if (next) setSelectedStage(next as EpicStageId);
        }}
        variant="outline"
        spacing={1}
        className="flex w-full flex-wrap justify-start"
      >
        {EPIC_STAGES.map((s) => (
          <ToggleGroupItem
            key={s.id}
            value={s.id}
            aria-label={s.label}
            className="h-9 gap-2 px-3 data-[state=on]:bg-secondary"
            disabled={isSearching}
          >
            <span className="text-xs font-medium">{s.label}</span>
            <Badge variant="outline" className="rounded-full px-1.5">
              {countsByStage[s.id]}
            </Badge>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {sections.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No epics match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.id} className="flex flex-col gap-3">
            <header className="flex items-baseline justify-between border-b pb-2">
              <h3 className="text-sm font-medium">
                {section.label}
                <span className="text-muted-foreground">
                  {" "}
                  · {section.items.length} {section.items.length === 1 ? "epic" : "epics"}
                </span>
              </h3>
            </header>
            {section.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No epics in this stage.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((epic) => (
                  <EpicCard key={epic.key} epic={epic} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

const JIRA_BASE = "https://carevicinity.atlassian.net/browse";

function EpicCard({ epic }: { epic: EpicSummary }) {
  const MAX_VISIBLE = 3;
  const visible = epic.assignees.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, epic.assignees.length - MAX_VISIBLE);
  const assigneeSummary =
    epic.assignees.length === 0 ? "Unassigned" : epic.assignees.map((a) => a.name).join(", ");

  return (
    <a
      href={`${JIRA_BASE}/${epic.key}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${epic.key} in Jira: ${epic.title}`}
      className="block rounded-xl transition-shadow hover:shadow-md"
    >
      <Card size="sm" className="transition-colors hover:bg-muted/40">
        <CardHeader className="gap-1">
          <div className="font-mono text-xs text-muted-foreground">{epic.key}</div>
          <CardTitle className="text-sm leading-snug">{epic.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-2">
          <Badge variant="outline">
            {epic.ticketCount} {epic.ticketCount === 1 ? "ticket" : "tickets"}
          </Badge>
          {epic.assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          ) : (
            <AvatarGroup aria-label={assigneeSummary} title={assigneeSummary}>
              {visible.map((a) => (
                <Avatar key={a.id} size="sm">
                  <AvatarFallback className="text-[10px]">{a.initials}</AvatarFallback>
                </Avatar>
              ))}
              {overflow > 0 ? (
                <AvatarGroupCount className="size-6 text-[10px]">+{overflow}</AvatarGroupCount>
              ) : null}
            </AvatarGroup>
          )}
        </CardContent>
      </Card>
    </a>
  );
}

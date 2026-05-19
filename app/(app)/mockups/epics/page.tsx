import {
  type EpicAssignee,
  type EpicSummary,
  EpicsPanel,
} from "@/components/dashboard/epics-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock people — when wired to Jira this will come from `team`.
const P: Record<string, EpicAssignee> = {
  jw: { id: "jw", name: "Joe W", initials: "JW" },
  mk: { id: "mk", name: "Mia K", initials: "MK" },
  sp: { id: "sp", name: "Sam P", initials: "SP" },
  pr: { id: "pr", name: "Priya R", initials: "PR" },
  dl: { id: "dl", name: "Dan L", initials: "DL" },
  am: { id: "am", name: "Ava M", initials: "AM" },
  nb: { id: "nb", name: "Nina B", initials: "NB" },
  ot: { id: "ot", name: "Omar T", initials: "OT" },
  ek: { id: "ek", name: "Ellie K", initials: "EK" },
};

const MOCK_EPICS: EpicSummary[] = [
  // Discovery → "To Do"
  {
    key: "CV-7001",
    title: "Marketing site refresh",
    stage: "discovery",
    ticketCount: 6,
    assignees: [P.mk],
  },
  {
    key: "CV-7012",
    title: "In-app referrals",
    stage: "discovery",
    ticketCount: 4,
    assignees: [],
  },
  {
    key: "CV-7020",
    title: "Rate limiting on public API",
    stage: "discovery",
    ticketCount: 3,
    assignees: [P.sp],
  },
  // Planned → "Scoped"
  {
    key: "CV-6890",
    title: "Support inbox v2",
    stage: "planned",
    ticketCount: 9,
    assignees: [P.dl, P.am],
  },
  {
    key: "CV-6912",
    title: "Two-factor authentication",
    stage: "planned",
    ticketCount: 7,
    assignees: [P.jw],
  },
  // Design → "In Design"
  {
    key: "CV-6750",
    title: "Coordinator dashboard",
    stage: "design",
    ticketCount: 12,
    assignees: [P.mk, P.am],
  },
  {
    key: "CV-6782",
    title: "Mobile bottom navigation",
    stage: "design",
    ticketCount: 5,
    assignees: [P.am],
  },
  {
    key: "CV-6801",
    title: "Empty states overhaul",
    stage: "design",
    ticketCount: 8,
    assignees: [P.mk],
  },
  {
    key: "CV-6830",
    title: "First-run onboarding tour",
    stage: "design",
    ticketCount: 6,
    assignees: [P.am, P.nb],
  },
  // Building → "Building" — typical: design + dev assignees both
  {
    key: "CV-5423",
    title: "Client App MVP",
    stage: "building",
    ticketCount: 14,
    assignees: [P.jw, P.mk, P.sp, P.ot, P.ek],
  },
  {
    key: "CV-6102",
    title: "Provider onboarding v2",
    stage: "building",
    ticketCount: 9,
    assignees: [P.sp, P.am],
  },
  {
    key: "CV-5901",
    title: "Rework Score 2.0",
    stage: "building",
    ticketCount: 7,
    assignees: [P.dl],
  },
  {
    key: "CV-6210",
    title: "Billing redesign",
    stage: "building",
    ticketCount: 11,
    assignees: [P.pr, P.mk, P.jw],
  },
  {
    key: "CV-6304",
    title: "Notifications hub",
    stage: "building",
    ticketCount: 6,
    assignees: [P.nb, P.am],
  },
  {
    key: "CV-6410",
    title: "Audit log surface",
    stage: "building",
    ticketCount: 5,
    assignees: [P.ot],
  },
  {
    key: "CV-6480",
    title: "Search infrastructure",
    stage: "building",
    ticketCount: 8,
    assignees: [P.dl, P.sp],
  },
  // PR → "Peer Review"
  {
    key: "CV-6520",
    title: "Webhook retry policy",
    stage: "pr",
    ticketCount: 4,
    assignees: [P.sp, P.dl],
  },
  // In QA → "QA"
  {
    key: "CV-6418",
    title: "Roles & permissions v3",
    stage: "in-qa",
    ticketCount: 10,
    assignees: [P.ek, P.jw],
  },
  {
    key: "CV-6455",
    title: "Audit log filters",
    stage: "in-qa",
    ticketCount: 4,
    assignees: [P.ek],
  },
  // Design Review → intentionally empty to show zero-state count
  // Done → "Ready for Release"
  {
    key: "CV-6020",
    title: "Sprint freeze + close-sprint snapshot",
    stage: "done",
    ticketCount: 6,
    assignees: [P.dl, P.ek],
  },
  {
    key: "CV-6055",
    title: "Burndown baseline anchor",
    stage: "done",
    ticketCount: 3,
    assignees: [P.dl],
  },
  {
    key: "CV-6080",
    title: "Basic auth gate for dashboard",
    stage: "done",
    ticketCount: 2,
    assignees: [P.jw],
  },
  {
    key: "CV-6110",
    title: "KPI row v4",
    stage: "done",
    ticketCount: 5,
    assignees: [P.dl, P.mk, P.ek],
  },
  {
    key: "CV-6145",
    title: "Hydration warning fixes",
    stage: "done",
    ticketCount: 1,
    assignees: [P.jw],
  },
];

export default function EpicsMockupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Mockup</span>
        <h1 className="text-xl font-semibold">Board view — Priorities / Epics tabs</h1>
        <p className="text-sm text-muted-foreground">
          Preview of the new Epics tab. Mock data only — no Jira wiring yet.
        </p>
      </div>

      <Tabs defaultValue="epics" className="gap-4">
        <TabsList variant="line" className="w-fit">
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="epics">Epics</TabsTrigger>
        </TabsList>

        <TabsContent value="priorities">
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Existing assignees filter + 4 ticket columns render here.
          </div>
        </TabsContent>

        <TabsContent value="epics">
          <EpicsPanel epics={MOCK_EPICS} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

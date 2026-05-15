import type { SprintKpis } from "@/lib/kpi";
import { KpiTile } from "./kpi-tile";

interface Props {
  kpis: SprintKpis;
}

export function KpiRow({ kpis }: Props) {
  const pct = kpis.percentComplete.toFixed(1);
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiTile
        label="Points committed"
        value={String(kpis.pointsCommitted)}
        hint="Frozen at Mon 8am Brisbane"
      />
      <KpiTile label="Points to PR" value={String(kpis.pointsToPr)} hint="Reached Peer Review" />
      <KpiTile label="% complete" value={`${pct}%`} />
      <KpiTile
        label="Days remaining"
        value={String(kpis.daysRemaining)}
        hint="Working days (Mon-Fri)"
      />
    </div>
  );
}

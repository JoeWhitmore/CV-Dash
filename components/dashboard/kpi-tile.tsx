import { Card, CardContent } from "@/components/ui/card";

interface Props {
  label: string;
  value: string;
  hint?: string;
}

export function KpiTile({ label, value, hint }: Props) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshButton } from "@/components/dashboard/refresh-button";

export function EmptyState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Connect to Jira</CardTitle>
          <CardDescription>
            No sprint data yet. Run a sync to pull active and upcoming sprints from the CV board.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RefreshButton variant="default" size="default" label="Sync from Jira" />
        </CardContent>
      </Card>
    </div>
  );
}

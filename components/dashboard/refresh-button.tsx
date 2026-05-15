"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncFromJira } from "@/lib/actions/sync";

interface Props {
  variant?: "default" | "outline";
  size?: "sm" | "default";
  label?: string;
}

export function RefreshButton({ variant = "outline", size = "sm", label = "Refresh" }: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await syncFromJira();
      if (result.ok) {
        const base = `Synced ${result.syncedTickets} tickets from Jira`;
        const suffix = result.warnings && result.warnings.length > 0 ? " — with warnings" : "";
        toast.success(base + suffix, {
          description: result.warnings?.length ? result.warnings.slice(0, 3).join("\n") : undefined,
        });
      } else {
        toast.error("Jira sync failed", { description: result.error });
      }
    });
  }

  return (
    <Button variant={variant} size={size} onClick={onClick} disabled={pending}>
      <RefreshCw className={pending ? "animate-spin" : ""} />
      {pending ? "Syncing…" : label}
    </Button>
  );
}

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Wrench, ExternalLink } from "lucide-react";

export function ToolManagerTab() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-6 backdrop-blur">
      <div className="flex items-start gap-3">
        <Wrench className="mt-0.5 h-6 w-6 text-primary" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Tool Manager</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Master Tool Intelligence — the single source of truth for every tool referenced
            in diagnostics, repair procedures, community discussions, and training.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link to="/owner/tools">
                Open Tool Manager <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
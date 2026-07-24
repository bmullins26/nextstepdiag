import { useState } from "react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { UpgradeDialog } from "./upgrade-dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function UsageMeter({ compact = false }: { compact?: boolean }) {
  const { data } = useEntitlements();
  const [open, setOpen] = useState(false);

  if (!data) return null;
  if (data.isPro) {
    if (data.isGrandfathered) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Grandfathered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
        <Sparkles className="h-3 w-3" />
        Pro
      </span>
    );
  }

  const used = data.lookupsUsed;
  const limit = data.lookupsLimit;
  const nearCap = used >= Math.floor(limit * 0.75);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
          nearCap
            ? "border-orange-500/40 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60"
        }`}
      >
        <span className="font-semibold">
          {used}/{limit}
        </span>
        {!compact && <span>lookups · Upgrade</span>}
      </button>
      <UpgradeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function QuotaExceededPrompt({ onUpgrade }: { onUpgrade?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-orange-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">You've hit your monthly limit</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Free accounts get 8 AI lookups per month. Upgrade for unlimited
              diagnostics, tech sheet uploads, and Tech Talk.
            </p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => {
                setOpen(true);
                onUpgrade?.();
              }}
            >
              See upgrade options
            </Button>
          </div>
        </div>
      </div>
      <UpgradeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
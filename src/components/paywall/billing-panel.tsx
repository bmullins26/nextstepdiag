import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { createBillingPortalSession } from "@/lib/billing.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { UpgradeDialog } from "./upgrade-dialog";
import { toast } from "sonner";

function planLabel(planType: string | null, tier: string) {
  if (tier !== "pro") return "Free";
  switch (planType) {
    case "grandfathered":
      return "Pro (Grandfathered)";
    case "week_pass":
      return "Pro · 7-Day Pass";
    case "monthly":
      return "Pro Monthly";
    case "annual":
      return "Pro Annual";
    default:
      return "Pro";
  }
}

export function BillingPanel() {
  const { data, isLoading, refetch } = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const portalFn = useServerFn(createBillingPortalSession);
  const qc = useQueryClient();

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await portalFn({
        data: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/dashboard`,
        },
      });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="glass-card flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing…
      </div>
    );
  }
  if (!data) return null;

  const label = planLabel(data.planType, data.isPro ? "pro" : "free");
  const endsAt = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
  const hasStripeCustomer = !!data.hasStripeCustomer;
  const configured = isPaymentsConfigured();

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Billing & Subscription
        </h2>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="text-lg font-bold">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {data.isPro ? (
              data.isGrandfathered ? (
                <>Permanent Pro access as a founding user. Thanks for being here early.</>
              ) : endsAt ? (
                <>
                  {data.cancelAtPeriodEnd ? "Access ends" : "Renews"}{" "}
                  {endsAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  .
                </>
              ) : (
                <>Active Pro access.</>
              )
            ) : (
              <>
                {data.lookupsUsed}/{data.lookupsLimit} AI lookups used this
                month. Upgrade for unlimited access, tech sheet uploads, and
                Tech Talk.
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!data.isPro && (
            <Button size="sm" onClick={() => setUpgradeOpen(true)} disabled={!configured}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Upgrade to Pro
            </Button>
          )}
          {data.isPro && !data.isGrandfathered && hasStripeCustomer && (
            <Button
              size="sm"
              variant="outline"
              onClick={openPortal}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-1.5 h-4 w-4" />
              )}
              Manage billing
            </Button>
          )}
          {data.isPro && !data.isGrandfathered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["my-entitlements"] });
                refetch();
              }}
            >
              Refresh
            </Button>
          )}
        </div>
      </div>

      {data.cancelAtPeriodEnd && !data.isGrandfathered && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Your Pro access is set to end at the current period. You'll keep
          everything until then.
        </div>
      )}

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
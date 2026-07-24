import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { getStripe, getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/billing.functions";
import { PaymentTestModeBanner } from "./PaymentTestModeBanner";
import { toast } from "sonner";

type Plan = "pro_week" | "pro_monthly" | "pro_annual";

const PLANS: Array<{
  id: Plan;
  name: string;
  price: string;
  cadence: string;
  badge?: string;
  highlights: string[];
}> = [
  {
    id: "pro_week",
    name: "7-Day Pass",
    price: "$1",
    cadence: "one-time · 7 days",
    highlights: ["Try Pro for a week", "Unlimited AI lookups", "Tech Talk access"],
  },
  {
    id: "pro_monthly",
    name: "Pro Monthly",
    price: "$9.99",
    cadence: "per month",
    highlights: ["Unlimited AI lookups", "Tech sheet uploads", "Tech Talk access"],
  },
  {
    id: "pro_annual",
    name: "Pro Annual",
    price: "$99",
    cadence: "per year",
    badge: "2 months free",
    highlights: ["Everything in Monthly", "Save vs monthly", "Priority feature access"],
  },
];

export function UpgradeDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reason?: string;
}) {
  const createCheckout = useServerFn(createCheckoutSession);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedPlan(null);
      setClientSecret(null);
    }
  }, [open]);

  const configured = isPaymentsConfigured();

  async function startCheckout(plan: Plan) {
    if (!configured) {
      toast.error("Payments are not configured yet.");
      return;
    }
    setSelectedPlan(plan);
    setLoading(true);
    try {
      const res = await createCheckout({
        data: {
          priceId: plan,
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      if (!res.clientSecret) throw new Error("No client secret returned");
      setClientSecret(res.clientSecret);
    } catch (e) {
      toast.error((e as Error).message);
      setSelectedPlan(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Upgrade to NextStep Pro
          </DialogTitle>
          <DialogDescription>
            {reason ??
              "Unlock unlimited AI diagnostics, tech sheet uploads, and Tech Talk with fellow technicians."}
          </DialogDescription>
        </DialogHeader>

        <PaymentTestModeBanner />

        {!configured ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Payments aren't set up in this environment yet. Once billing is
            configured you'll be able to upgrade here.
          </div>
        ) : clientSecret ? (
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setClientSecret(null);
                setSelectedPlan(null);
              }}
            >
              ← Choose a different plan
            </Button>
            <div className="mt-3">
              <EmbeddedCheckoutProvider
                stripe={getStripe()}
                options={{ fetchClientSecret: async () => clientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-border/60 bg-card/50 p-4"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  {p.badge && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {p.badge}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{p.price}</div>
                  <div className="text-xs text-muted-foreground">{p.cadence}</div>
                </div>
                <ul className="mt-3 flex-1 space-y-1.5 text-xs">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5">
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  disabled={loading && selectedPlan === p.id}
                  onClick={() => startCheckout(p.id)}
                >
                  {loading && selectedPlan === p.id ? "Loading…" : "Choose"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
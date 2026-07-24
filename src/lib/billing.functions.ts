import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

export type Entitlements = {
  tier: "free" | "pro";
  planType: "week_pass" | "monthly" | "annual" | "grandfathered" | null;
  status: string;
  isPro: boolean;
  isGrandfathered: boolean;
  lookupsUsed: number;
  lookupsLimit: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function periodMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export const getMyEntitlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Entitlements> => {
    // Grandfathered rows have environment='sandbox' by default; keep the
    // most recent row regardless of env so a returning live user still
    // sees their sandbox trial state until the live row lands.
    const { data: subs } = await context.supabase
      .from("subscriptions")
      .select(
        "tier, plan_type, status, current_period_end, cancel_at_period_end, environment, updated_at",
      )
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(5);
    // Prefer an active pro row over an older canceled one.
    const sub =
      (subs ?? []).find(
        (s) =>
          s.tier === "pro" &&
          (s.plan_type === "grandfathered" ||
            (s.current_period_end &&
              new Date(s.current_period_end as string) > new Date())),
      ) ?? (subs ?? [])[0];

    const { data: usage } = await context.supabase
      .from("usage_counters")
      .select("lookups_used")
      .eq("user_id", context.userId)
      .eq("period_month", periodMonth())
      .maybeSingle();

    const tier = ((sub?.tier as string) ?? "free") as "free" | "pro";
    const planType = (sub?.plan_type ?? null) as Entitlements["planType"];
    const isGrandfathered = planType === "grandfathered";
    const currentPeriodEnd = (sub?.current_period_end ?? null) as string | null;
    const isPro =
      tier === "pro" &&
      (isGrandfathered ||
        (currentPeriodEnd !== null && new Date(currentPeriodEnd) > new Date()));

    return {
      tier,
      planType,
      status: (sub?.status ?? "active") as string,
      isPro,
      isGrandfathered,
      lookupsUsed: (usage?.lookups_used as number | undefined) ?? 0,
      lookupsLimit: isPro ? -1 : 8,
      currentPeriodEnd,
      cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
    };
  });

const CheckoutInput = z.object({
  priceId: z.enum(["pro_week", "pro_monthly", "pro_annual"]),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CheckoutInput.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ clientSecret: string } | { error: string }> => {
      try {
        const stripe = createStripeClient(data.environment as StripeEnv);

        const prices = await stripe.prices.list({
          lookup_keys: [data.priceId],
        });
        if (!prices.data.length) throw new Error("Price not found");
        const price = prices.data[0];
        const isRecurring = price.type === "recurring";

        const { data: userRes } = await context.supabase.auth.getUser();
        const email = userRes.user?.email ?? undefined;

        // Resolve or create Customer with userId metadata (searchable).
        let customerId: string | undefined;
        if (/^[a-zA-Z0-9_-]+$/.test(context.userId)) {
          const found = await stripe.customers.search({
            query: `metadata['userId']:'${context.userId}'`,
            limit: 1,
          });
          if (found.data.length) {
            customerId = found.data[0].id;
          } else if (email) {
            const list = await stripe.customers.list({ email, limit: 1 });
            if (list.data.length) {
              customerId = list.data[0].id;
              await stripe.customers.update(customerId, {
                metadata: {
                  ...(list.data[0].metadata ?? {}),
                  userId: context.userId,
                },
              });
            } else {
              const created = await stripe.customers.create({
                email,
                metadata: { userId: context.userId },
              });
              customerId = created.id;
            }
          } else {
            const created = await stripe.customers.create({
              metadata: { userId: context.userId },
            });
            customerId = created.id;
          }
        }

        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: price.id, quantity: 1 }],
          mode: isRecurring ? "subscription" : "payment",
          ui_mode: "embedded_page",
          return_url: data.returnUrl,
          ...(customerId && { customer: customerId }),
          ...(!isRecurring && {
            payment_intent_data: { description: "NextStep Pro — 7-day access" },
          }),
          metadata: { userId: context.userId, priceId: data.priceId },
          ...(isRecurring && {
            subscription_data: {
              metadata: {
                userId: context.userId,
                priceId: data.priceId,
              },
            },
          }),
        } as any);

        return { clientSecret: session.client_secret ?? "" };
      } catch (error) {
        console.error("[billing] checkout error:", error);
        return { error: getStripeErrorMessage(error) };
      }
    },
  );

const PortalInput = z.object({
  returnUrl: z.string().url().optional(),
  environment: z.enum(["sandbox", "live"]),
});

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PortalInput.parse(d))
  .handler(
    async ({ data, context }): Promise<{ url: string } | { error: string }> => {
      const { data: sub } = await context.supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", context.userId)
        .eq("environment", data.environment)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub?.stripe_customer_id) {
        return { error: "No billing account found. Subscribe first." };
      }

      try {
        const stripe = createStripeClient(data.environment as StripeEnv);
        const portal = await stripe.billingPortal.sessions.create({
          customer: sub.stripe_customer_id as string,
          ...(data.returnUrl && { return_url: data.returnUrl }),
        });
        return { url: portal.url };
      } catch (error) {
        console.error("[billing] portal error:", error);
        return { error: getStripeErrorMessage(error) };
      }
    },
  );

// Record a week-pass purchase into subscriptions on successful checkout
// (used by the return page as a client fallback in addition to the webhook).
export const finalizeWeekPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sessionId: z.string().min(3),
      environment: z.enum(["sandbox", "live"]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      if (session.payment_status !== "paid" || session.mode !== "payment") {
        return { ok: false, error: "Session not paid" };
      }
      const metadataUserId = session.metadata?.userId;
      if (metadataUserId !== context.userId) {
        return { ok: false, error: "User mismatch" };
      }
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      const priceId = session.metadata?.priceId ?? "pro_week";
      const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: context.userId,
          tier: "pro",
          status: "active",
          plan_type: "week_pass",
          stripe_customer_id: customerId,
          price_id: priceId,
          environment: data.environment,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      return { ok: true };
    } catch (error) {
      console.error("[billing] finalize week pass error:", error);
      return { ok: false, error: getStripeErrorMessage(error) };
    }
  });
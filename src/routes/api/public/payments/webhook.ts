import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function planTypeFor(priceId: string | null | undefined): "week_pass" | "monthly" | "annual" | null {
  if (priceId === "pro_week") return "week_pass";
  if (priceId === "pro_monthly") return "monthly";
  if (priceId === "pro_annual") return "annual";
  return null;
}

async function upsertSubscription(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.error("[webhook] subscription missing userId metadata");
    return;
  }
  const item = sub.items?.data?.[0];
  const priceId =
    item?.price?.lookup_key ??
    item?.price?.metadata?.lovable_external_id ??
    null;
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  const isActive = ["active", "trialing", "past_due"].includes(sub.status);

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      tier: isActive ? "pro" : "free",
      status: sub.status,
      plan_type: planTypeFor(priceId),
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer,
      price_id: priceId,
      environment: env,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : null,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function markCanceled(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) return;
  await getSupabase()
    .from("subscriptions")
    .update({
      tier: "free",
      status: "canceled",
      plan_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("environment", env);
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  if (session.mode !== "payment") return; // subscriptions handled by subscription.* events
  const userId = session.metadata?.userId;
  const priceId = session.metadata?.priceId ?? "pro_week";
  if (!userId) return;
  if (planTypeFor(priceId) !== "week_pass") return;

  const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      tier: "pro",
      status: "active",
      plan_type: "week_pass",
      stripe_customer_id: session.customer,
      price_id: priceId,
      environment: env,
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd,
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await markCanceled(event.data.object, env);
      break;
    default:
      console.log("[webhook] unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv as StripeEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
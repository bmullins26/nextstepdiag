import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { finalizeCheckout, getMyEntitlements } from "@/lib/billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (s) =>
    z
      .object({ session_id: z.string().optional().catch(undefined) })
      .parse(s),
  head: () => ({
    meta: [
      { title: "Finalizing your purchase — NextStep Diagnostics" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutReturnPage,
});

function CheckoutReturnPage() {
  const { session_id } = Route.useSearch();
  const finalize = useServerFn(finalizeCheckout);
  const entitlements = useServerFn(getMyEntitlements);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState<string>("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      if (!session_id) {
        setStatus("error");
        setMessage("Missing checkout session id.");
        return;
      }
      try {
        const env = getStripeEnvironment();
        const res = await finalize({ data: { sessionId: session_id, environment: env } });
        if (!res.ok && res.error) {
          // Not fatal — the webhook may still deliver.
          console.warn("[checkout.return] finalize warning:", res.error);
        }

        // Poll entitlements briefly to catch webhook delivery.
        for (let i = 0; i < 6; i++) {
          const ent = await entitlements();
          if (ent?.isPro) break;
          await new Promise((r) => setTimeout(r, 750));
        }

        await qc.invalidateQueries({ queryKey: ["my-entitlements"] });
        setStatus("success");
        setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();
  }, [session_id]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-6 text-center">
        {status === "working" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 text-lg font-bold">Finalizing your purchase…</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hang tight — activating your Pro access.
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-4 text-lg font-bold">You're Pro. Welcome aboard.</h1>
            <p className="mt-1 text-sm text-muted-foreground">Redirecting to your dashboard…</p>
          </>
        )}
        {status === "error" && (
          <>
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <h1 className="mt-4 text-lg font-bold">We couldn't confirm the payment.</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {message || "It may still be processing. Check your dashboard in a moment."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild size="sm">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailX, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "Unsubscribe — NextStep Diagnostics" },
      {
        name: "description",
        content: "Stop receiving email updates from NextStep Diagnostics.",
      },
      { property: "og:title", content: "Unsubscribe — NextStep Diagnostics" },
      {
        property: "og:description",
        content: "Stop receiving email updates from NextStep Diagnostics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

type State = "loading" | "valid" | "invalid" | "done" | "submitting";

function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok || body?.valid === false) {
          setState(body?.alreadyUnsubscribed || body?.already_unsubscribed ? "done" : "invalid");
          return;
        }
        setEmail(body?.email ?? null);
        setState("valid");
      })
      .catch(() => setState("invalid"));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setState("submitting");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(r.ok ? "done" : "invalid");
    } catch {
      setState("invalid");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/70 p-8 text-center backdrop-blur">
        <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          NextStep Diagnostics
        </p>

        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Checking your link…</p>
          </div>
        )}

        {(state === "valid" || state === "submitting") && (
          <>
            <MailX className="mx-auto mb-4 h-8 w-8 text-foreground" />
            <h1 className="text-xl font-semibold">Unsubscribe from emails</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {email ? `${email} will no longer` : "You will no longer"} receive email from
              NextStep Diagnostics.
            </p>
            <Button className="mt-6 w-full" disabled={state === "submitting"} onClick={confirm}>
              {state === "submitting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm unsubscribe
            </Button>
          </>
        )}

        {state === "done" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-8 w-8 text-foreground" />
            <h1 className="text-xl font-semibold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We won't send you any more email. You can still use your NextStep account normally.
            </p>
          </>
        )}

        {state === "invalid" && (
          <>
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
            <h1 className="text-xl font-semibold">This link isn't valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The unsubscribe link is missing, expired, or already used.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

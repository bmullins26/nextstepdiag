import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Check, GraduationCap, Loader2, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { DiagnosticDemo } from "@/components/landing/diagnostic-demo";
import { supabase } from "@/integrations/supabase/client";
import { claimPartnerPerk } from "@/lib/partners/perk.functions";
import academyLogo from "@/assets/freds-academy-logo.png.asset.json";

// Unlisted partner page: noindex, not linked from the site. Shared directly with academy students.
export const Route = createFileRoute("/freds-academy")({
  head: () => ({
    meta: [
      { title: "Fred's Appliance Academy × NextStep — 3 Months Free Pro" },
      { name: "description", content: "Fred's Appliance Academy students and grads get 3 months of NextStep Diagnostics Pro free." },
      { property: "og:title", content: "3 Months Free NextStep Pro for Fred's Academy" },
      { property: "og:description", content: "Guided field diagnostics, serial age decoding and model parts for Fred's students and grads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FredsAcademyPage,
});

const PERKS = [
  { icon: Wrench, title: "Guided diagnostics", body: "One question at a time, the next test to run, and what reading to expect." },
  { icon: CalendarClock, title: "Age & warranty decoding", body: "Serial date codes for Whirlpool, GE, Samsung, LG, Frigidaire and more." },
  { icon: ShieldCheck, title: "Model-specific parts", body: "Parts pulled from the exact model's diagram — no guessing at part numbers." },
  { icon: Smartphone, title: "Built for the phone", body: "Use it in lab, on ride-alongs, and on your first solo calls." },
];

type State = "loading" | "signed_out" | "ready" | "claiming" | "done";

function FredsAcademyPage() {
  const claim = useServerFn(claimPartnerPerk);
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState(data.session ? "ready" : "signed_out")).catch(() => setState("signed_out"));
  }, []);

  async function activate() {
    setState("claiming");
    try {
      const r = await claim({ data: { partner: "freds_academy" } });
      const until = r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : null;
      if (r.status === "granted") setMsg(`Pro is active until ${until}. No card needed — it simply ends after 3 months.`);
      else if (r.status === "already_claimed") setMsg(until ? `You already claimed this offer. Pro runs until ${until}.` : "You already claimed this offer.");
      else setMsg("Your account already has Pro, so nothing changed.");
      setState("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      setState("ready");
    }
  }

  const cta = (
    <div className="flex flex-col items-center gap-3">
      {state === "loading" && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      {state === "signed_out" && (
        <>
          <Button asChild size="lg" className="h-12 w-full max-w-xs text-base">
            <Link to="/auth" search={{ next: "/freds-academy" }}>Create free account</Link>
          </Button>
          <p className="text-sm text-muted-foreground">Already have an account? <Link to="/auth" search={{ next: "/freds-academy" }} className="underline">Sign in</Link> to claim.</p>
        </>
      )}
      {(state === "ready" || state === "claiming") && (
        <Button size="lg" className="h-12 w-full max-w-xs text-base" onClick={activate} disabled={state === "claiming"}>
          {state === "claiming" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-5 w-5" />}
          Activate 3 months free Pro
        </Button>
      )}
      {state === "done" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="flex items-center gap-2 font-medium"><Check className="h-5 w-5 text-primary" />{msg}</p>
          <Button asChild size="lg" className="h-12"><Link to="/diagnose">Start a diagnosis</Link></Button>
        </div>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <BrandLogo size={110} />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Academy Community Perk</span>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1fr_1.1fr] md:py-20">
        <div className="flex justify-center">
          <img src={academyLogo.url} alt="Fred's Appliance Academy" className="w-64 max-w-full sm:w-80" />
        </div>
        <div className="text-center md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <GraduationCap className="h-4 w-4" /> Students & grads: 3 months Pro, free
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-5xl">A special perk for Fred's Appliance Academy</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Take NextStep Diagnostics into your lab days, ride-alongs and first service calls. Full Pro, no credit card, nothing to cancel.
          </p>
          <div className="mt-8 md:flex md:justify-start">{cta}</div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/30 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Try a real call before you sign up</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">Data plate to part number — the same steps you'll use in the field.</p>
          <div className="mt-8"><DiagnosticDemo /></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-5">
              <p.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-2xl font-bold">Claim your 3 months of Pro</h2>
          <p className="mt-2 text-muted-foreground">One offer per account. After 3 months you drop to the free plan unless you choose to upgrade.</p>
          <div className="mt-6">{cta}</div>
        </div>
      </section>
    </main>
  );
}

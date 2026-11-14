import { SiteFooter } from "@/components/site/site-footer";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { DiagnosticDemo } from "@/components/landing/diagnostic-demo";
import { ArrowRight, BadgeCheck, CalendarClock, Check, FileText, Mic, ShieldCheck, Users, Wrench, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NextStep Diagnostics — A Technician In Your Pocket" },
      { name: "description", content: "Grounded appliance diagnostics for working technicians: serial decoding, warranty clues, test sequences and OEM parts in seconds." },
      { property: "og:title", content: "NextStep Diagnostics — Don't Guess. Know Your Next Step." },
      { property: "og:description", content: "Watch a real appliance diagnosis go from complaint to part number in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PILLARS = [
  { icon: CalendarClock, title: "Real serial decoding", body: "Manufacturer date-code rules for Whirlpool, Maytag, Kenmore, GE, Samsung and more — verified, not guessed." },
  { icon: ShieldCheck, title: "Warranty clues up front", body: "Know before you quote whether the unit may still be covered or is past end of life." },
  { icon: Users, title: "Backed by confirmed repairs", body: "Every diagnosis is ranked against real fixes other techs have confirmed in the field." },
  { icon: Wrench, title: "Exact test sequence", body: "What to check first, where to put your meter, and what reading to expect." },
  { icon: Mic, title: "Built for gloves-on work", body: "Big buttons, one question at a time, and fast on a phone in a basement." },
  { icon: FileText, title: "Owner manuals & tech sheets", body: "Ask questions of the documents for the exact model you're standing in front of." },
];

const PLANS = [
  { name: "Free", price: "$0", per: "forever", feats: ["8 full diagnostics / month", "All follow-up steps included", "Serial & age decoding", "Error code lookup"], cta: "Start free" },
  { name: "Pro Monthly", price: "$9.99", per: "/ month", feats: ["Unlimited diagnoses", "Confirmed-repair matching", "Tech Talk community", "Document assistant"], cta: "Go Pro", featured: true },
  { name: "Pro Yearly", price: "$99", per: "/ year", feats: ["Everything in Pro", "Two months free", "Priority beta features"], cta: "Save yearly" },
];

function Index() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] opacity-40"
        style={{ background: "radial-gradient(ellipse at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 60%)" }}
      />

      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <BrandLogo size={110} />
          <nav className="flex items-center gap-1 sm:gap-4">
            <a href="#demo" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Demo</a>
            <a href="#pricing" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Pricing</a>
            <Button asChild size="sm" variant="ghost"><Link to="/auth" search={{ next: "" }}>Sign in</Link></Button>
            <Button asChild size="sm"><Link to="/diagnose">Start</Link></Button>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-12 lg:grid-cols-2 lg:pt-20">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] font-semibold text-primary">
            <Zap className="h-3 w-3" /> COMPLAINT → PART NUMBER IN SECONDS
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Don't Guess.
            <br />
            <span className="text-primary">Know Your Next Step.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            A technician in your pocket. NextStep decodes the serial, checks for bulletins, matches confirmed field repairs, and hands you the exact test to run next.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-14 px-8 text-base font-bold">
              <Link to="/diagnose">Start Diagnosis <ArrowRight className="ml-1 h-5 w-5" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base font-semibold">
              <a href="#demo">Try the demo</a>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {["No credit card for free tier", "Works on any phone", "Built by working techs"].map((t) => (
              <span key={t} className="flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-primary" />{t}</span>
            ))}
          </div>
        </div>
        <div id="demo" className="min-w-0 scroll-mt-20">
          <DiagnosticDemo />
        </div>
      </section>

      <section className="relative border-y border-border bg-card/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4">
          {[
            ["10+", "Brands decoded"],
            ["1", "Question at a time"],
            ["0", "Generic AI guesses"],
            ["$1", "7-day Pro pass"],
          ].map(([k, v]) => (
            <div key={v}>
              <div className="font-mono text-3xl font-black text-primary">{k}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-semibold text-secondary">WHY NEXTSTEP</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Grounded in real repairs — not chatbot guesses.</h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="group rounded-2xl border border-border bg-card/50 p-6 transition hover:border-primary/40 hover:bg-card/80">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative scroll-mt-20 mx-auto max-w-6xl px-4 pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-semibold text-secondary">PRICING</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Priced for techs, not enterprise.</h2>
          <p className="mt-3 text-muted-foreground">No per-seat fees. No add-ons. Try Pro for a week for $1.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={
                "relative flex flex-col rounded-2xl border p-6 " +
                (p.featured ? "border-primary bg-primary/5 shadow-[0_0_50px_-15px] shadow-primary/50" : "border-border bg-card/50")
              }
            >
              {p.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-secondary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">Most popular</span>
              )}
              <div className="text-sm font-semibold text-muted-foreground">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-black">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.per}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {p.feats.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{f}</li>
                ))}
              </ul>
              <Button asChild className="mt-6 h-12 w-full font-bold" variant={p.featured ? "default" : "outline"}>
                <Link to="/diagnose">{p.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-4 pb-20">
        <div className="rounded-3xl border border-primary/30 bg-card/60 p-8 text-center sm:p-12">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Your next call should be your fastest.</h2>
          <p className="mt-3 text-muted-foreground">Start free, or join the private beta and help shape what's next.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-14 px-8 font-bold"><Link to="/diagnose">Start Diagnosis <ArrowRight className="ml-1 h-5 w-5" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-8"><Link to="/beta">Apply for beta</Link></Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

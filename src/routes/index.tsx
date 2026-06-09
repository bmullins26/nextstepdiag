import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Wrench } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NextStep Diagnostics — A Technician In Your Pocket" },
      { name: "description", content: "Guided field diagnostics for appliance technicians. Don't guess. Know your next step." },
      { property: "og:title", content: "NextStep Diagnostics" },
      { property: "og:description", content: "A technician in your pocket." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(31,199,199,0.35), transparent 60%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center px-6 pb-10 pt-10">
        <BrandLogo size={260} className="drop-shadow-[0_10px_40px_rgba(31,199,199,0.25)]" />

        <p className="mt-2 text-center text-sm font-medium tracking-wide text-muted-foreground">
          <span className="text-foreground">A technician</span>{" "}
          <span className="text-primary">in your pocket.</span>
        </p>

        <div className="mt-12 w-full rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
          <h1 className="text-center text-4xl font-black leading-tight tracking-tight">
            Don't Guess.
            <br />
            <span className="text-primary">Know Your Next Step.</span>
          </h1>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Guided, one-question-at-a-time diagnostics built for working appliance technicians.
          </p>

          <Button asChild size="lg" className="mt-6 h-14 w-full text-base font-bold">
            <Link to="/diagnose">
              Start Diagnosis <ArrowRight className="ml-1 h-5 w-5" />
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid w-full grid-cols-3 gap-3 text-center">
          {[
            { k: "Verify", v: "Appliance" },
            { k: "Capture", v: "Complaint" },
            { k: "Isolate", v: "Failure" },
          ].map((s, i) => (
            <div key={s.k} className="rounded-xl border border-border bg-card/40 p-3">
              <div className="text-xs font-semibold text-secondary">STEP {i + 1}</div>
              <div className="mt-1 text-sm font-bold">{s.k}</div>
              <div className="text-[11px] text-muted-foreground">{s.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-10 text-xs text-muted-foreground">
          <Wrench className="h-3.5 w-3.5 text-primary" /> Built for the field, not the office.
        </div>
      </div>
    </main>
  );
}

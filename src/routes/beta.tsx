import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { BetaApplicationForm } from "@/components/beta/application-form";
import { Wrench, Zap, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/beta")({
  head: () => ({
    meta: [
      { title: "NextStep Beta — Apply to Join" },
      {
        name: "description",
        content:
          "Apply to join the NextStep Diagnostics private beta. Help shape the field-tested diagnostic tool built for appliance technicians.",
      },
      { property: "og:title", content: "NextStep Beta" },
      {
        property: "og:description",
        content: "Apply to join the NextStep Diagnostics private beta.",
      },
    ],
  }),
  component: BetaPage,
});

function BetaPage() {
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
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center px-6 pb-16 pt-10">
        <Link to="/" className="self-center">
          <BrandLogo size={120} />
        </Link>
        <span className="mt-3 inline-flex rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          Private Beta
        </span>
        <h1 className="mt-4 text-center text-3xl font-black leading-tight tracking-tight sm:text-4xl">
          Apply to test NextStep in the field
        </h1>
        <p className="mt-3 max-w-xl text-center text-sm text-muted-foreground">
          NextStep is a guided diagnostic assistant built with — and for — appliance
          technicians. We're rolling out access in waves so we can iterate quickly with
          the testers who give us the best feedback.
        </p>

        <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
          <Bullet icon={<Wrench className="h-4 w-4" />} title="Field tested">
            Built around real diagnostic workflows, not lab demos.
          </Bullet>
          <Bullet icon={<Zap className="h-4 w-4" />} title="Fast access">
            Selected testers get invited in batches as the next wave opens.
          </Bullet>
          <Bullet icon={<ShieldCheck className="h-4 w-4" />} title="Your voice counts">
            Bug reports and feedback feed directly into the next release.
          </Bullet>
        </div>

        <div className="mt-8 w-full rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
          <BetaApplicationForm />
        </div>

        <Link
          to="/"
          className="mt-6 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}

function Bullet({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 text-sm">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="font-semibold text-foreground">{title}</span></div>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
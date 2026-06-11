import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Stethoscope,
  FileText,
  AlertTriangle,
  ChevronRight,
  Loader2,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listSessions } from "@/lib/sessions.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { amOwner } from "@/lib/owner.functions";
import { Button } from "@/components/ui/button";
import { AccountSettingsDialog } from "@/components/account-settings-dialog";
import { OwnerPanels } from "@/components/owner-panels";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — NextStep Diagnostics" },
      {
        name: "description",
        content: "Your diagnostic command center.",
      },
    ],
  }),
  component: DashboardPage,
});

type Row = {
  id: string;
  status: "active" | "completed" | "abandoned";
  brand: string;
  appliance_type: string;
  model_number: string;
  complaint: string;
  updated_at: string;
};

const QUICK_ACTIONS = [
  {
    to: "/diagnose" as const,
    label: "Start a Diagnosis",
    description: "Verify the appliance and walk through guided questions.",
    icon: Stethoscope,
    accent: "from-primary/30 to-primary/5",
  },
  {
    to: "/documents" as const,
    label: "Document Assistant",
    description: "Upload a tech sheet or wiring diagram and ask questions.",
    icon: FileText,
    accent: "from-secondary/30 to-secondary/5",
  },
  {
    to: "/error-codes" as const,
    label: "Error Code Lookup",
    description: "Decode brand-specific fault codes in seconds.",
    icon: AlertTriangle,
    accent: "from-amber-400/30 to-amber-400/5",
  },
];

function DashboardPage() {
  const list = useServerFn(listSessions);
  const profileFn = useServerFn(getMyProfile);
  const ownerFn = useServerFn(amOwner);
  const [recent, setRecent] = useState<Row[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    list({ data: {} })
      .then((rows) => setRecent((rows as Row[]).slice(0, 5)))
      .catch(() => setRecent([]));
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => profileFn(),
  });

  const { data: ownerCheck } = useQuery({
    queryKey: ["am-owner"],
    queryFn: () => ownerFn(),
    staleTime: 60_000,
  });
  const isOwner = !!ownerCheck?.isOwner;

  const greetingName =
    (profile?.display_name && profile.display_name.trim()) ||
    (profile?.full_name && profile.full_name.trim()) ||
    (email ?? "").split("@")[0] ||
    "Technician";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">
              Welcome back, {greetingName}.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A technician in your pocket — pick up where you left off, or start
              something new.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="shrink-0"
          >
            <SettingsIcon className="mr-1.5 h-4 w-4" />
            Account
          </Button>
        </header>

        {isOwner ? (
          <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
                Owner Dashboard
              </h2>
            </div>
            <OwnerPanels />
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="group glass-card flex flex-col gap-3 p-5 transition hover:glow-teal hover:border-primary/40"
            >
              <div
                className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${a.accent} ring-1 ring-white/10`}
              >
                <a.icon className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <div className="text-base font-bold">{a.label}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.description}
                </p>
              </div>
              <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Open <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Recent Diagnostics
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Your last 5 sessions across all statuses.
                </p>
              </div>
              <Link
                to="/history"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-4">
              {recent === null ? (
                <div className="flex justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : recent.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No sessions yet. Start your first diagnosis from{" "}
                  <Link
                    to="/diagnose"
                    className="font-semibold text-primary"
                  >
                    Diagnose
                  </Link>
                  .
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {recent.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <HistoryIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">
                          {r.appliance_type || "Unspecified appliance"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[r.brand, r.model_number].filter(Boolean).join(" · ") || "—"}
                          {r.complaint ? ` · ${r.complaint}` : ""}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          r.status === "active"
                            ? "bg-primary/15 text-primary"
                            : r.status === "completed"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.status}
                      </span>
                      <Link
                        to="/diagnose"
                        search={{ session: r.id }}
                        className="shrink-0 text-xs font-semibold text-primary"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="glass-card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Field Tips
            </h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Verify line voltage before you replace any control board.
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Always log current findings — NextStep weights them when picking
                the next test.
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Stuck on a fault code? Open Error Codes for instant decoding.
              </li>
            </ul>
          </aside>
        </section>
      </div>
      <AccountSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        email={email}
        currentDisplayName={profile?.display_name ?? null}
        plan={profile?.plan ?? null}
      />
    </main>
  );
}
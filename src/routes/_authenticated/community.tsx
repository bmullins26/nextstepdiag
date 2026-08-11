import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, PlusCircle, Search, Sparkles, ShieldCheck, TrendingUp, Users, Clock, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCommunityHome } from "@/lib/community.functions";
import { DiscussionCard, type DiscussionSummary } from "@/components/community/discussion-card";
import { listConfirmedRepairs, type ConfirmedRepair } from "@/lib/confirmed-repairs.functions";
import { ConfirmedRepairCard } from "@/components/community/confirmed-repair-card";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community — NextStep Diagnostics" },
      { name: "description", content: "Technician community discussions tied to brand, model, and complaint." },
    ],
  }),
  component: CommunityLayout,
});

function CommunityLayout() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId !== "/_authenticated/community" && m.routeId.startsWith("/_authenticated/community"));
  if (isChild) return <Outlet />;
  return <CommunityHome />;
}

function CommunityHome() {
  const home = useServerFn(listCommunityHome);
  const { data, isLoading } = useQuery({
    queryKey: ["community", "home"],
    queryFn: () => home({}),
  });
  const [q, setQ] = useState("");
  const repairsFn = useServerFn(listConfirmedRepairs);
  const { data: repairs } = useQuery({
    queryKey: ["community", "confirmed-repairs", "home"],
    queryFn: () => repairsFn({ data: { limit: 5, sort: "newest" } }) as Promise<{ items: ConfirmedRepair[] }>,
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Community</h1>
            <p className="text-sm text-muted-foreground">
              Technician knowledge, tied to real appliances.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/community/browse">
              <Button variant="outline" className="h-10"><Search className="mr-1.5 h-4 w-4" /> Browse</Button>
            </Link>
            <Link to="/community/new">
              <Button className="h-10"><PlusCircle className="mr-1.5 h-4 w-4" /> Post</Button>
            </Link>
          </div>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) window.location.href = `/community/search?q=${encodeURIComponent(q.trim())}`;
          }}
          className="mb-6"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search brand, model, error code, complaint…"
              className="h-11 pl-10"
            />
          </div>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-8">
            <Section title="Recent Discussions" icon={Clock}>
              <CardList list={(data?.recent ?? []) as DiscussionSummary[]} />
            </Section>
            <Section title="Popular Repairs" icon={Sparkles}>
              <CardList list={(data?.popular ?? []) as DiscussionSummary[]} />
            </Section>
            <Section title="Confirmed Repairs" icon={ShieldCheck}>
              {(repairs?.items.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No confirmed repairs shared yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {repairs!.items.map((r) => <ConfirmedRepairCard key={r.id} repair={r} />)}
                </div>
              )}
              <Link
                to="/community/confirmed-repairs"
                className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
              >
                View all confirmed repairs
              </Link>
            </Section>
            <Section title="Verified Discussions" icon={ShieldCheck}>
              <CardList list={(data?.verified ?? []) as DiscussionSummary[]} />
            </Section>
            <Section title="Trending Models" icon={TrendingUp}>
              <TrendingModelList list={data?.trendingModels ?? []} />
            </Section>
            <Section title="Most Active Contributors" icon={Users}>
              <ContributorList list={data?.contributors ?? []} />
            </Section>
            <Section title="Newest Uploads" icon={UploadCloud}>
              <CardList list={(data?.newest ?? []) as DiscussionSummary[]} />
            </Section>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

function CardList({ list }: { list: DiscussionSummary[] }) {
  if (!list.length) return <p className="text-xs text-muted-foreground">Nothing here yet.</p>;
  return (
    <div className="space-y-2">
      {list.slice(0, 6).map((d) => <DiscussionCard key={d.id} d={d} />)}
    </div>
  );
}

function TrendingModelList({ list }: { list: Array<{ brand: string; type: string; model: string; count: number }> }) {
  if (!list.length) return <p className="text-xs text-muted-foreground">No trending models yet.</p>;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {list.map((m) => (
        <Link
          key={`${m.brand}-${m.model}`}
          to="/community/browse"
          search={{ brand: m.brand, applianceType: m.type, model: m.model }}
          className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm hover:border-primary/50"
        >
          <div className="text-[11px] text-muted-foreground">{m.brand} · {m.type}</div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold">{m.model}</span>
            <span className="text-[11px] text-muted-foreground">{m.count} recent</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ContributorList({ list }: { list: Array<{ id: string; name: string; score: number }> }) {
  if (!list.length) return <p className="text-xs text-muted-foreground">No activity in the last 30 days.</p>;
  return (
    <ol className="space-y-1.5">
      {list.map((c, i) => (
        <li key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2">
          <span className="flex items-center gap-2 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">{i + 1}</span>
            <span className="font-semibold">{c.name}</span>
          </span>
          <span className="text-[11px] text-muted-foreground">{c.score} pts</span>
        </li>
      ))}
    </ol>
  );
}
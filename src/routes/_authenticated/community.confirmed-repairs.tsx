import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listConfirmedRepairs, type ConfirmedRepair } from "@/lib/confirmed-repairs.functions";
import { ConfirmedRepairCard } from "@/components/community/confirmed-repair-card";

export const Route = createFileRoute("/_authenticated/community/confirmed-repairs")({
  head: () => ({
    meta: [
      { title: "Confirmed Repairs — Community — NextStep" },
      { name: "description", content: "Verified repairs confirmed by technicians in the field." },
    ],
  }),
  component: ConfirmedRepairsLayout,
});

function ConfirmedRepairsLayout() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId.startsWith("/_authenticated/community/confirmed-repairs/"));
  if (isChild) return <Outlet />;
  return <ConfirmedRepairsList />;
}

type Sort = "newest" | "helpful" | "discussed" | "confirmed";

function ConfirmedRepairsList() {
  const list = useServerFn(listConfirmedRepairs);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [failure, setFailure] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const { data, isLoading } = useQuery({
    queryKey: ["community", "confirmed-repairs", brand, model, failure, sort],
    queryFn: () =>
      list({
        data: {
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          failure: failure.trim() || undefined,
          sort,
          limit: 30,
          offset: 0,
        },
      }) as Promise<{ items: ConfirmedRepair[]; hasMore: boolean }>,
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        <Link to="/community" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Community
        </Link>
        <h1 className="mb-1 text-xl font-bold">Confirmed Repairs</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Repairs technicians confirmed in the field and chose to share.
        </p>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" className="h-10" />
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className="h-10" />
          <Input value={failure} onChange={(e) => setFailure(e.target.value)} placeholder="Failure or part" className="h-10" />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["newest", "helpful", "discussed", "confirmed"] as Sort[]).map((s) => (
            <Button key={s} size="sm" variant={sort === s ? "default" : "outline"} onClick={() => setSort(s)}>
              {s === "confirmed" ? "Most confirmed" : s === "discussed" ? "Most discussed" : s === "helpful" ? "Most helpful" : "Newest"}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No confirmed repairs shared yet.
          </div>
        ) : (
          <div className="space-y-2">
            {data!.items.map((r) => <ConfirmedRepairCard key={r.id} repair={r} />)}
          </div>
        )}
      </div>
    </main>
  );
}

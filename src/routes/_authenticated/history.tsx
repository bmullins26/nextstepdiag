import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Star, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listSessions,
  toggleFavorite,
  deleteSession,
} from "@/lib/sessions.functions";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — NextStep Diagnostics" }] }),
  component: HistoryPage,
});

type Row = {
  id: string;
  status: "active" | "completed" | "abandoned";
  is_favorite: boolean;
  brand: string;
  appliance_type: string;
  model_number: string;
  serial_number: string;
  complaint: string;
  updated_at: string;
  created_at: string;
};

const TABS = ["all", "active", "completed", "abandoned"] as const;
type Tab = (typeof TABS)[number];

function HistoryPage() {
  const navigate = useNavigate();
  const list = useServerFn(listSessions);
  const fav = useServerFn(toggleFavorite);
  const del = useServerFn(deleteSession);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  async function load() {
    try {
      const r = (await list({ data: { search, status: tab } })) as Row[];
      setRows(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load history.");
    }
  }

  useEffect(() => {
    load();
  }, [tab]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  const favorites = useMemo(() => (rows ?? []).filter((r) => r.is_favorite), [rows]);
  const others = useMemo(() => (rows ?? []).filter((r) => !r.is_favorite), [rows]);

  async function onToggleFav(r: Row) {
    setRows((prev) =>
      prev?.map((x) => (x.id === r.id ? { ...x, is_favorite: !r.is_favorite } : x)) ?? null,
    );
    try {
      await fav({ data: { id: r.id, is_favorite: !r.is_favorite } });
    } catch {
      load();
    }
  }

  async function onDelete(r: Row) {
    if (!confirm("Delete this diagnosis? This cannot be undone.")) return;
    setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
    try {
      await del({ data: { id: r.id } });
      toast.success("Deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
      load();
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 md:px-8">
        <h1 className="text-2xl font-black tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every service call you've worked on.</p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model, serial, brand, type, complaint…"
            className="h-11 pl-9"
          />
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                tab === t ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="mt-10 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No diagnoses yet. Start one from{" "}
            <Link to="/diagnose" className="font-semibold text-primary">
              Diagnose
            </Link>
            .
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {favorites.length > 0 && (
              <Section title="Favorites">
                <div className="space-y-2">
                  {favorites.map((r) => (
                    <Card key={r.id} row={r} onResume={() => navigate({ to: "/diagnose", search: { session: r.id } })} onView={() => navigate({ to: "/history/$id", params: { id: r.id } })} onFav={() => onToggleFav(r)} onDelete={() => onDelete(r)} />
                  ))}
                </div>
              </Section>
            )}
            <Section title={favorites.length > 0 ? "All Sessions" : ""}>
              <div className="space-y-2">
                {others.map((r) => (
                  <Card key={r.id} row={r} onResume={() => navigate({ to: "/diagnose", search: { session: r.id } })} onView={() => navigate({ to: "/history/$id", params: { id: r.id } })} onFav={() => onToggleFav(r)} onDelete={() => onDelete(r)} />
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

const STATUS_COLOR: Record<Row["status"], string> = {
  active: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-400",
  abandoned: "bg-muted text-muted-foreground",
};

function Card({
  row,
  onResume,
  onView,
  onFav,
  onDelete,
}: {
  row: Row;
  onResume: () => void;
  onView: () => void;
  onFav: () => void;
  onDelete: () => void;
}) {
  const title = row.appliance_type || "Unspecified appliance";
  const subtitle = [row.brand, row.model_number].filter(Boolean).join(" · ") || "—";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[row.status]}`}>
              {row.status}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(row.updated_at).toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 truncate text-sm font-bold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
          {row.complaint && (
            <p className="mt-1.5 line-clamp-2 text-xs text-foreground/80">{row.complaint}</p>
          )}
        </div>
        <button
          onClick={onFav}
          aria-label="Toggle favorite"
          className={row.is_favorite ? "text-amber-400" : "text-muted-foreground hover:text-foreground"}
        >
          <Star className="h-5 w-5" fill={row.is_favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {row.status === "active" ? (
          <Button onClick={onResume} className="h-9 flex-1 text-xs">
            Resume <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={onResume} variant="outline" className="h-9 flex-1 text-xs">
            Reopen
          </Button>
        )}
        <Button onClick={onView} variant="outline" className="h-9 flex-1 text-xs">
          View Details
        </Button>
        <Button onClick={onDelete} variant="ghost" className="h-9 px-2 text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
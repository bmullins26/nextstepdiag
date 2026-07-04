import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Loader2, Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchCommunity } from "@/lib/community.functions";
import { DiscussionCard, type DiscussionSummary } from "@/components/community/discussion-card";

const Schema = z.object({ q: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/_authenticated/community/search")({
  head: () => ({ meta: [{ title: "Search — Community — NextStep" }] }),
  validateSearch: (s: Record<string, unknown>) => Schema.parse(s),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const search = useServerFn(searchCommunity);
  const query = (q ?? "").trim();
  const { data, isLoading } = useQuery({
    queryKey: ["community", "search", query],
    queryFn: () => search({ data: { q: query } }),
    enabled: query.length > 0,
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        <Link to="/community" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Community
        </Link>
        <div className="relative mb-4">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q ?? ""}
            onChange={(e) => navigate({ search: { q: e.target.value || undefined } })}
            placeholder="Search brand, model, error code, complaint…"
            className="h-11 pl-10"
          />
        </div>
        {!query ? (
          <p className="text-sm text-muted-foreground">Type to search.</p>
        ) : isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No matches for "{query}".
          </div>
        ) : (
          <div className="space-y-2">
            {(data ?? []).map((d) => <DiscussionCard key={d.id} d={d as DiscussionSummary} />)}
          </div>
        )}
      </div>
    </main>
  );
}
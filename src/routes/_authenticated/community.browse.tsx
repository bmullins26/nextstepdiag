import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { browseCommunity } from "@/lib/community.functions";
import { DiscussionCard, type DiscussionSummary } from "@/components/community/discussion-card";
import { APPLIANCE_BRANDS } from "@/lib/appliance-brands";

const Search = z.object({
  brand: z.string().optional().catch(undefined),
  applianceType: z.string().optional().catch(undefined),
  model: z.string().optional().catch(undefined),
  complaint: z.string().optional().catch(undefined),
  sort: z.enum(["recent", "helpful", "verified"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/community/browse")({
  head: () => ({ meta: [{ title: "Browse — Community — NextStep" }] }),
  validateSearch: (s: Record<string, unknown>) => Search.parse(s),
  component: BrowsePage,
});

const TYPES = [
  "", "Refrigerator", "Top-Load Washer", "Front-Load Washer", "Electric Dryer",
  "Gas Dryer", "Dishwasher", "Range", "Wall Oven", "Microwave", "Ice Maker",
  "Freezer", "Cooktop", "Other",
];

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = useServerFn(browseCommunity);

  const { data, isLoading } = useQuery({
    queryKey: ["community", "browse", search],
    queryFn: () => list({ data: { ...search, sort: search.sort ?? "recent" } }),
  });

  const set = (patch: Partial<z.infer<typeof Search>>) =>
    navigate({ search: { ...search, ...patch } as never });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link to="/community" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Community
          </Link>
          <Link to="/community/new"><Button className="h-9">Post</Button></Link>
        </div>
        <h1 className="text-xl font-bold">Browse discussions</h1>
        <p className="mb-4 text-sm text-muted-foreground">Filter by Brand → Appliance Type → Model → Complaint.</p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Select value={search.brand ?? "__all"} onValueChange={(v) => set({ brand: v === "__all" ? undefined : v })}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All brands</SelectItem>
              {APPLIANCE_BRANDS.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={search.applianceType ?? "__all"} onValueChange={(v) => set({ applianceType: v === "__all" ? undefined : v })}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Appliance type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All types</SelectItem>
              {TYPES.filter(Boolean).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder="Model"
            value={search.model ?? ""}
            onChange={(e) => set({ model: e.target.value || undefined })}
            className="h-10 font-mono uppercase"
          />
          <Input
            placeholder="Complaint contains…"
            value={search.complaint ?? ""}
            onChange={(e) => set({ complaint: e.target.value || undefined })}
            className="h-10"
          />
          <Select value={search.sort ?? "recent"} onValueChange={(v) => set({ sort: v as "recent" | "helpful" | "verified" })}>
            <SelectTrigger className="h-10 col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Sort: Most recent</SelectItem>
              <SelectItem value="helpful">Sort: Most helpful</SelectItem>
              <SelectItem value="verified">Sort: Verified repairs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No matching discussions yet.{" "}
            <Link to="/community/new" className="font-semibold text-primary">Start one.</Link>
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
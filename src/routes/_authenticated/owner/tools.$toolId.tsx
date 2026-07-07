import { createFileRoute, Link, redirect, isRedirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Pencil,
  ExternalLink,
  ChevronDown,
  Loader2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { amOwner } from "@/lib/owner.functions";
import { getTool, listTools } from "@/lib/tools.functions";
import { ToolDialog } from "@/components/owner/tool-dialog";

export const Route = createFileRoute("/_authenticated/owner/tools/$toolId")({
  head: () => ({ meta: [{ title: "Tool — NextStep Diagnostics" }] }),
  beforeLoad: async () => {
    try {
      const { isOwner } = await amOwner();
      if (!isOwner) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ToolDetailPage,
  errorComponent: ({ error }) => (
    <main className="min-h-screen bg-background p-8">
      <p className="text-sm text-destructive">{(error as Error).message}</p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="min-h-screen bg-background p-8">
      <p className="text-sm text-muted-foreground">Tool not found.</p>
    </main>
  ),
});

function ToolDetailPage() {
  const { toolId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const getFn = useServerFn(getTool);
  const listFn = useServerFn(listTools);

  const [editOpen, setEditOpen] = useState(false);

  const { data: tool, isLoading, error } = useQuery({
    queryKey: ["owner-tool", toolId],
    queryFn: () => getFn({ data: { id: toolId } }),
  });

  // pull categories for the edit dialog combobox
  const { data: listData } = useQuery({
    queryKey: ["owner-tools", "categories-only"],
    queryFn: () => listFn({ data: { pageSize: 1 } }),
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-center px-4 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </main>
    );
  }
  if (error || !tool) {
    return (
      <main className="min-h-screen bg-background p-8">
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "Not found"}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/owner/tools">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Tool Manager
            </Link>
          </Button>
        </div>

        <header className="mb-6 flex items-start gap-3">
          <Wrench className="mt-1 h-6 w-6 text-primary" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{tool.tool_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{tool.tool_type}</Badge>
              <Badge variant="outline">{tool.category}</Badge>
              {tool.subcategory ? <Badge variant="outline">{tool.subcategory}</Badge> : null}
              <Badge variant={tool.active ? "default" : "outline"}>
                {tool.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
        </header>

        <div className="grid gap-4">
          <section className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Details
            </h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Quantity" value={String(tool.quantity)} />
              <Field
                label="Affiliate URL"
                value={
                  tool.affiliate_url ? (
                    <a
                      href={tool.affiliate_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open link <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
              <div className="sm:col-span-2">
                <Field
                  label="Notes"
                  value={
                    tool.notes ? (
                      <p className="whitespace-pre-wrap text-sm">{tool.notes}</p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                />
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-border/60 bg-card/60 backdrop-blur">
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between p-5 text-left">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Metadata
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Read-only JSONB for development inspection.
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border/60 p-5">
                  <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">
{JSON.stringify(tool.metadata ?? {}, null, 2)}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

          <ComingSoonCard title="Compatible Repairs" />
          <ComingSoonCard title="Compatible Appliance Types" />
          <ComingSoonCard title="Community Reviews" />
          <ComingSoonCard title="Training Videos" />
          <ComingSoonCard title="Technician Ownership" />
        </div>

        <ToolDialog
          open={editOpen}
          mode="edit"
          tool={tool}
          serverCategories={listData?.categories ?? []}
          onOpenChange={setEditOpen}
          onSuccess={() => {
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ["owner-tool", toolId] });
            qc.invalidateQueries({ queryKey: ["owner-tools"] });
            router.invalidate();
          }}
        />
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function ComingSoonCard({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-dashed border-border/60 bg-card/30 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="outline">Coming Soon</Badge>
      </div>
    </section>
  );
}
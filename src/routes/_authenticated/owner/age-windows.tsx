import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteModelWindow, listModelWindows } from "@/lib/model-windows.functions";

export const Route = createFileRoute("/_authenticated/owner/age-windows")({
  head: () => ({
    meta: [
      { title: "Production Windows — Owner Console" },
      { name: "description", content: "Model production windows learned from data-plate confirmations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgeWindowsPage,
});

function AgeWindowsPage() {
  const list = useServerFn(listModelWindows);
  const del = useServerFn(deleteModelWindow);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["owner", "model-windows"], queryFn: () => list() });

  async function remove(id: string) {
    if (!confirm("Delete this production window?")) return;
    try {
      await del({ data: { id } });
      toast.success("Window deleted.");
      qc.invalidateQueries({ queryKey: ["owner", "model-windows"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Production Windows</h1>
        <p className="text-sm text-muted-foreground">
          Year ranges per brand + model prefix. They narrow serial dates only when the possible dates are at least 5 years apart.
        </p>
      </div>
      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : !q.data?.length ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No windows yet. They appear as technicians confirm dates from the data plate.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Brand</th><th className="p-2">Model prefix</th><th className="p-2">Range</th>
                <th className="p-2">Observed</th><th className="p-2">Confirmations</th><th className="p-2">Source</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {q.data.map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="p-2">{w.brand_key ?? w.manufacturer}</td>
                  <td className="p-2 font-mono">{w.model_prefix}</td>
                  <td className="p-2">{w.introduced_year ?? "—"}–{w.discontinued_year ?? (w.introduced_year ? "current" : "—")}</td>
                  <td className="p-2">{w.observed_min_year ?? "—"}–{w.observed_max_year ?? "—"}</td>
                  <td className="p-2">{w.evidence_count}</td>
                  <td className="p-2">{w.source ?? "owner"}</td>
                  <td className="p-2 text-right">
                    <Button size="icon" variant="ghost" aria-label="Delete window" onClick={() => remove(w.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

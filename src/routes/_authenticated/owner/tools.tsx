import { createFileRoute, Link, redirect, isRedirect } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Eye,
  Pencil,
  Copy,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wrench,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { amOwner } from "@/lib/owner.functions";
import {
  listTools,
  createTool,
  updateTool,
  duplicateTool,
  setToolActive,
  deleteTool,
  exportTools,
  TOOL_TYPES,
  type ToolRow,
  type ToolType,
} from "@/lib/tools.functions";
import { ToolDialog } from "@/components/owner/tool-dialog";

export const Route = createFileRoute("/_authenticated/owner/tools")({
  head: () => ({ meta: [{ title: "Tool Manager — NextStep Diagnostics" }] }),
  beforeLoad: async () => {
    try {
      const { isOwner } = await amOwner();
      if (!isOwner) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ToolsPage,
});

function ToolsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTools);
  const exportFn = useServerFn(exportTools);
  const dupFn = useServerFn(duplicateTool);
  const activeFn = useServerFn(setToolActive);
  const deleteFn = useServerFn(deleteTool);

  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toolType, setToolType] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<ToolRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ToolRow | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(rawSearch);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawSearch]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["owner-tools", { search, toolType, category, status, page }],
    queryFn: () =>
      listFn({ data: { search, toolType, category, status, page, pageSize: 25 } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["owner-tools"] });

  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Tool duplicated.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      activeFn({ data: { id, active } }),
    onSuccess: () => {
      toast.success("Tool updated.");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Tool deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleExport = async () => {
    try {
      const { csv, count } = await exportFn();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tools-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} tools.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openCreate = () => {
    setDialogMode("create");
    setEditTarget(null);
    setDialogOpen(true);
  };
  const openEdit = (row: ToolRow) => {
    setDialogMode("edit");
    setEditTarget(row);
    setDialogOpen(true);
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cats = useMemo(() => data?.categories ?? [], [data]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tool Manager</h1>
            <p className="text-sm text-muted-foreground">
              Master Tool Intelligence — every tool referenced by diagnostics, repair procedures,
              and community content.
            </p>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search tools…"
              className="pl-9"
            />
          </div>
          <Select value={toolType} onValueChange={(v) => { setToolType(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TOOL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v as "all" | "active" | "inactive"); setPage(1); }}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button variant="outline" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Tool</Button>
          <Button
            variant="outline"
            disabled
            title="Tool import will be enabled in the next phase."
            className="cursor-not-allowed opacity-60"
            onClick={() => toast.info("Tool import will be enabled in the next phase.")}
          ><Upload className="h-4 w-4 mr-1" /> Import</Button>
          <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Tool Name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="px-3 py-2">
                        <Link
                          to="/owner/tools/$toolId"
                          params={{ toolId: r.id }}
                          className="font-medium hover:underline"
                        >
                          {r.tool_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{r.tool_type}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.category}
                        {r.subcategory ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            / {r.subcategory}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.active ? "default" : "outline"}>
                          {r.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/owner/tools/$toolId" params={{ toolId: r.id }}>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(r)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => dupMut.mutate(r.id)}
                              disabled={dupMut.isPending}
                            >
                              <Copy className="mr-2 h-4 w-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => activeMut.mutate({ id: r.id, active: !r.active })}
                              disabled={activeMut.isPending}
                            >
                              {r.active ? (
                                <>
                                  <ToggleLeft className="mr-2 h-4 w-4" /> Disable
                                </>
                              ) : (
                                <>
                                  <ToggleRight className="mr-2 h-4 w-4" /> Enable
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(r)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        No tools found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {rows.length ? (page - 1) * pageSize + 1 : 0}–
                {Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        <ToolDialog
          open={dialogOpen}
          mode={dialogMode}
          tool={editTarget}
          serverCategories={cats}
          onOpenChange={setDialogOpen}
          onSuccess={() => {
            setDialogOpen(false);
            invalidate();
          }}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Tool?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove <strong>{deleteTarget?.tool_name}</strong>. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}
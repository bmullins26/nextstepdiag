import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  createTool,
  updateTool,
  TOOL_TYPES,
  type ToolRow,
  type ToolType,
} from "@/lib/tools.functions";
import { useRecentCategories } from "@/lib/use-recent-categories";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  tool: ToolRow | null;
  serverCategories: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function ToolDialog({ open, mode, tool, serverCategories, onOpenChange, onSuccess }: Props) {
  const createFn = useServerFn(createTool);
  const updateFn = useServerFn(updateTool);
  const { recent, push } = useRecentCategories();

  const [toolType, setToolType] = useState<ToolType>("Hand Tool");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [toolName, setToolName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && tool) {
      setToolType(tool.tool_type as ToolType);
      setCategory(tool.category);
      setSubcategory(tool.subcategory ?? "");
      setToolName(tool.tool_name);
      setQuantity(tool.quantity);
      setAffiliateUrl(tool.affiliate_url ?? "");
      setNotes(tool.notes ?? "");
      setActive(tool.active);
    } else {
      setToolType("Hand Tool");
      setCategory("");
      setSubcategory("");
      setToolName("");
      setQuantity(1);
      setAffiliateUrl("");
      setNotes("");
      setActive(true);
    }
  }, [open, mode, tool]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const payload = {
        tool_type: toolType,
        category: category.trim(),
        subcategory: subcategory.trim() || null,
        tool_name: toolName.trim(),
        quantity: Number.isFinite(quantity) ? quantity : 1,
        affiliate_url: affiliateUrl.trim() || null,
        notes: notes.trim() || null,
        active,
      };
      if (mode === "edit" && tool) {
        return updateFn({ data: { id: tool.id, patch: payload } });
      }
      return createFn({ data: payload });
    },
    onSuccess: () => {
      push(category);
      toast.success(mode === "edit" ? "Tool updated." : "Tool created.");
      onSuccess();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Tool" : "Add Tool"}</DialogTitle>
          <DialogDescription>
            {mode === "edit" ? "Update tool details." : "Add a new tool to the master registry."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="tool_name">Tool Name *</Label>
            <Input id="tool_name" value={toolName} onChange={(e) => setToolName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tool Type *</Label>
              <Select value={toolType} onValueChange={(v) => setToolType(v as ToolType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOOL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Category *</Label>
              <CategoryCombobox
                value={category}
                onChange={setCategory}
                recent={recent}
                all={serverCategories}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Input id="subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value || "0", 10))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="affiliate_url">Affiliate URL</Label>
            <Input
              id="affiliate_url"
              type="url"
              placeholder="https://…"
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
            <div>
              <Label htmlFor="active" className="cursor-pointer">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive tools are hidden from recommendations.</p>
            </div>
            <Switch id="active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending || !toolName.trim() || !category.trim()}
          >
            {submitMut.isPending ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryCombobox({
  value,
  onChange,
  recent,
  all,
}: {
  value: string;
  onChange: (v: string) => void;
  recent: string[];
  all: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const others = all.filter((c) => !recent.some((r) => r.toLowerCase() === c.toLowerCase()));
  const trimmed = search.trim();
  const showCreate =
    trimmed.length > 0 &&
    !recent.some((r) => r.toLowerCase() === trimmed.toLowerCase()) &&
    !all.some((c) => c.toLowerCase() === trimmed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || "Select or type…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Search or type a category…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.map((c) => (
                  <CommandItem
                    key={`recent-${c}`}
                    value={c}
                    onSelect={() => { onChange(c); setSearch(""); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                    {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {others.length > 0 && (
              <CommandGroup heading="All categories">
                {others.map((c) => (
                  <CommandItem
                    key={c}
                    value={c}
                    onSelect={() => { onChange(c); setSearch(""); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                    {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup heading="Add new">
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => { onChange(trimmed); setSearch(""); setOpen(false); }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Use "{trimmed}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { upsertApplianceTypeOverride } from "@/lib/appliance-type-overrides.functions";

export const APPLIANCE_TYPE_OPTIONS = [
  "Washer",
  "Dryer",
  "Refrigerator",
  "Freezer",
  "Dishwasher",
  "Range/Oven",
  "Cooktop",
  "Microwave",
  "Ice Maker",
  "Wine Cooler",
  "Other",
];

export function ApplianceTypeEditor({
  brand,
  model,
  currentType,
  currentSubType,
  onSaved,
  buttonClassName,
  size = "sm",
}: {
  brand: string;
  model: string;
  currentType: string;
  currentSubType?: string;
  onSaved: (newType: string, newSubType: string) => void;
  buttonClassName?: string;
  size?: "sm" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(currentType || "");
  const [customType, setCustomType] = useState(
    currentType && !APPLIANCE_TYPE_OPTIONS.includes(currentType) ? currentType : "",
  );
  const [sub, setSub] = useState(currentSubType ?? "");
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertApplianceTypeOverride);

  const effectiveType =
    type === "Other" || (type && !APPLIANCE_TYPE_OPTIONS.includes(type))
      ? customType.trim()
      : type;

  async function handleSave() {
    if (!brand.trim() || !model.trim()) {
      toast.error("Brand and model number are required to save a correction.");
      return;
    }
    if (!effectiveType) {
      toast.error("Pick an appliance type.");
      return;
    }
    setSaving(true);
    try {
      await upsert({
        data: {
          brand,
          model,
          applianceType: effectiveType,
          subType: sub.trim() || null,
        },
      });
      toast.success(`Saved. Future scans of ${brand} ${model} will use ${effectiveType}.`);
      onSaved(effectiveType, sub.trim());
      setOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {size === "icon" ? (
          <button
            type="button"
            className={
              buttonClassName ||
              "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }
            aria-label="Edit appliance type"
            title="Edit appliance type"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className={
              buttonClassName ||
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }
          >
            <Pencil className="h-3 w-3" /> Edit type
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Appliance Type
          </Label>
          <select
            value={APPLIANCE_TYPE_OPTIONS.includes(type) ? type : type ? "Other" : ""}
            onChange={(e) => setType(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Select…</option>
            {APPLIANCE_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        {(type === "Other" || (type && !APPLIANCE_TYPE_OPTIONS.includes(type))) && (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Custom type
            </Label>
            <Input
              placeholder="e.g. Trash Compactor"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="h-10"
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Sub-type / platform (optional)
          </Label>
          <Input
            placeholder="e.g. Top-Load, Side-by-Side"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            className="h-10"
          />
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Saved corrections are remembered for{" "}
          <span className="font-semibold text-foreground">
            {brand || "this brand"} {model || ""}
          </span>{" "}
          and applied automatically next time.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

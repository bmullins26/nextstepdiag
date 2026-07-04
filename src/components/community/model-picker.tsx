import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { searchKnownModels } from "@/lib/community.functions";

export function ModelPicker({
  brand,
  applianceType,
  value,
  onChange,
  confirmed,
  onConfirmedChange,
}: {
  brand: string;
  applianceType: string;
  value: string;
  onChange: (v: string) => void;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
}) {
  const search = useServerFn(searchKnownModels);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brand) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = (await search({ data: { brand, applianceType, q: value } })) as string[];
        if (!cancelled) setSuggest(rows);
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [brand, applianceType, value, search]);

  const upper = value.toUpperCase();
  const known = suggest.includes(upper);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="e.g. WRF555SDFZ"
          className="h-11 font-mono uppercase"
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {suggest.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggest.slice(0, 8).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-mono transition ${
                value.toUpperCase() === m
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {value && !known && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => onConfirmedChange(Boolean(v))}
            className="mt-0.5"
          />
          <span>
            <strong>Not seen before.</strong> Confirm the exact model number is <span className="font-mono">{value.toUpperCase()}</span>.
          </span>
        </label>
      )}
    </div>
  );
}
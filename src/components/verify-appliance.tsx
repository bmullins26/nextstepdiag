import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Search,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APPLIANCE_BRANDS } from "@/lib/appliance-brands";
import { decodeAppliance } from "@/lib/serial-decode.functions";
import { RepairInsightsCard } from "@/components/repair-insights-card";

export type DecodedAppliance = {
  identified: boolean;
  brand: string;
  manufacturer: string;
  applianceType: string;
  platform: string;
  modelNumber: string;
  serialNumber: string;
  manufactureDate: { year: number; month?: number | null; rangeStart: string; rangeEnd: string } | null;
  ageYears: number | null;
  confidence: string;
  confidencePercent?: number;
  decodedBreakdown: string;
  ruleFamily: string;
  ruleName?: string;
  ruleBreakdown: string;
  notes: string;
  unknownReason?: string | null;
  candidates?: Array<{ year: number; month: number | null; week: number | null; score: number; sourceCount: number }>;
  corroboration?: {
    used: boolean;
    cached: boolean;
    hitCount: number;
    sourceTypes?: string[];
    retailerSignal?: "discontinued" | "in_stock" | null;
    hits: Array<{ url: string; title?: string; trust: string; sourceType?: string; year?: number; excerpt?: string }>;
  } | null;
};

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function humanReason(r: string): string {
  switch (r) {
    case "unsupported_manufacturer":
      return "we don't have a decoder for this manufacturer yet.";
    case "invalid_serial_format":
      return "the serial number doesn't match this brand's known formats.";
    case "missing_date_code":
      return "this serial doesn't contain a date code (some brands print it elsewhere on the data plate).";
    case "ambiguous_year_cycle":
      return "the year code repeats on a cycle and we couldn't pick one confidently.";
    case "insufficient_information":
      return "not enough information was provided.";
    case "low_confidence":
      return "the serial yields multiple possible years and we couldn't corroborate one. Please read the date code from the data plate.";
    default:
      return r;
  }
}

export function VerifyAppliance({
  onConfirm,
}: {
  onConfirm: (a: DecodedAppliance) => void;
}) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [result, setResult] = useState<DecodedAppliance | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const decode = useServerFn(decodeAppliance);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APPLIANCE_BRANDS;
    return APPLIANCE_BRANDS.filter((b) => b.name.toLowerCase().includes(q));
  }, [query]);

  async function handleDecode() {
    if (!brand.trim() || !model.trim() || !serial.trim()) {
      toast.error("Brand, model number, and serial number are all required to decode.");
      return;
    }
    setDecoding(true);
    setResult(null);
    try {
      const r = await decode({ data: { brand, modelNumber: model, serialNumber: serial } });
      setResult(r as DecodedAppliance);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Decode failed.");
    } finally {
      setDecoding(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        {/* Brand picker */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Brand</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-base"
              >
                <span className={brand ? "text-foreground" : "text-muted-foreground"}>
                  {brand || "Select brand…"}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search brand…"
                  className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <ul className="max-h-72 overflow-y-auto py-1">
                {filtered.map((b) => (
                  <li key={b.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setBrand(b.name);
                        setPickerOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10"
                    >
                      <span className="flex items-center gap-2">
                        {brand === b.name ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4" />}
                        <span>{b.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-muted-foreground">No brands matched.</li>
                )}
              </ul>
            </PopoverContent>
          </Popover>
        </div>

        {/* Model number */}
        <div className="space-y-1.5">
          <Label htmlFor="model" className="text-xs uppercase tracking-wide text-muted-foreground">Model Number</Label>
          <Input
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="WTW5000DW1"
            className="h-12 text-base"
          />
        </div>

        {/* Serial */}
        <div className="space-y-1.5">
          <Label htmlFor="serial" className="text-xs uppercase tracking-wide text-muted-foreground">Serial Number</Label>
          <Input
            id="serial"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="C81234567"
            className="h-12 w-full text-base"
          />
        </div>

        <Button onClick={handleDecode} disabled={decoding} className="h-14 w-full text-base font-bold">
          {decoding ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Decoding serial…</>
          ) : (
            "Decode"
          )}
        </Button>
      </div>

      {result && (
        <div className="space-y-3 rounded-2xl border border-primary/40 bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Wrench className="h-4 w-4" /> Identification
          </div>
          <KV k="Manufacturer" v={result.manufacturer || result.brand} />
          <KV k="Appliance Type" v={[result.applianceType, result.platform].filter(Boolean).join(" · ") || "—"} />
          <KV k="Model" v={result.modelNumber} />
          <KV k="Serial" v={result.serialNumber} />
          <KV
            k="Built"
            v={
              result.manufactureDate?.year
                ? `${result.manufactureDate.month ? MONTHS[result.manufactureDate.month] + " " : ""}${result.manufactureDate.year} (${result.manufactureDate.rangeStart} → ${result.manufactureDate.rangeEnd})`
                : "Unknown"
            }
          />
          <KV k="Age" v={result.ageYears != null ? `${Math.max(0, Math.round(result.ageYears))} yr` : "Unknown"} />
          <KV
            k="Confidence"
            v={
              result.confidencePercent != null
                ? `${result.confidence} · ${result.confidencePercent}% (cap 80%)`
                : result.confidence
            }
          />
          <KV k="Applied Rule" v={result.ruleName || result.ruleFamily || "—"} />

          {result.candidates && result.candidates.length > 1 ? (
            <details className="rounded-lg border border-border bg-background/40 p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Other possible years ({result.candidates.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {result.candidates.map((c) => (
                  <li key={`${c.year}-${c.month ?? ""}`} className="flex justify-between gap-2">
                    <span>
                      {c.month ? MONTHS[c.month] + " " : ""}
                      {c.year}
                      {c.week ? ` (wk ${c.week})` : ""}
                    </span>
                    <span className="font-mono">
                      score {c.score.toFixed(2)}
                      {c.sourceCount > 0 ? ` · ${c.sourceCount} src` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {result.corroboration?.used ? (
            <details className="rounded-lg border border-border bg-background/40 p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Web corroboration · {result.corroboration.hitCount} source
                {result.corroboration.hitCount === 1 ? "" : "s"}
                {result.corroboration.cached ? " (cached)" : ""}
              </summary>
              <ul className="mt-2 space-y-2 text-xs">
                {result.corroboration.hits.map((h, i) => (
                  <li key={i} className="space-y-0.5">
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-primary underline-offset-2 hover:underline"
                    >
                      {h.title || h.url}
                    </a>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {h.trust.replace("_", " ")}
                      {h.year ? ` · cites ${h.year}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {result.ageYears == null && result.unknownReason ? (
            <p className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              Age unknown — {humanReason(result.unknownReason)}
            </p>
          ) : null}

          {import.meta.env.DEV && (
            <div className="rounded-lg border border-dashed border-secondary/60 bg-background/40 p-3 text-[11px] font-mono text-muted-foreground">
              <div>Manufacturer: {result.manufacturer || result.brand}</div>
              <div>Serial: {result.serialNumber}</div>
              <div>Applied Rule: {result.ruleName || result.ruleFamily}</div>
              <div>
                Manufacture Date:{" "}
                {result.manufactureDate?.year
                  ? `${result.manufactureDate.year}-${String(result.manufactureDate.month ?? "??").padStart(2, "0")}`
                  : "unknown"}
              </div>
              <div>
                Calculated Age: {result.ageYears != null ? `${result.ageYears.toFixed(2)} yr` : "unknown"}
              </div>
              {result.unknownReason ? <div>Unknown Reason: {result.unknownReason}</div> : null}
            </div>
          )}

          <details className="rounded-lg border border-border bg-background/40 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              How we decoded this
            </summary>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Rules ({result.ruleFamily}):</span> {result.ruleBreakdown}</p>
              <p><span className="font-semibold text-foreground">Reasoning:</span> {result.decodedBreakdown}</p>
            </div>
          </details>

          {result.notes && (
            <p className="rounded-lg border border-border bg-background/40 p-3 text-sm text-muted-foreground">
              {result.notes}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="h-12 flex-1"
              onClick={() => setResult(null)}
            >
              Not my appliance
            </Button>
            <Button
              className="h-12 flex-[1.4] font-bold"
              onClick={() => onConfirm(result)}
              disabled={!result.identified}
            >
              Looks right →
            </Button>
          </div>
        </div>
      )}

      {result?.modelNumber ? (
        <RepairInsightsCard model={result.modelNumber} />
      ) : null}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-semibold">{v}</span>
    </div>
  );
}
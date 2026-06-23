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
import { submitKnownYear } from "@/lib/age-ground-truth.functions";
import { ApplianceTypeEditor } from "@/components/appliance-type-editor";
import { RepairInsightsCard } from "@/components/repair-insights-card";

export type DecodedAppliance = {
  identified: boolean;
  brand: string;
  manufacturer: string;
  applianceType: string;
  platform: string;
  typeSource?: "decoder" | "user_override";
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
  ageProvider?: {
    source: "appliance_age_api" | "cache" | "local_fallback";
    cached: boolean;
    manufactureYear: number | null;
    manufactureMonth: number | null;
    confidencePercent: number | null;
    alternativeYears: Array<{ year: number; month: number | null; confidencePercent: number; fullDate: string | null }>;
    description: string | null;
    responseTimeMs: number;
    error?: string | null;
  };
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
  const submitTruth = useServerFn(submitKnownYear);

  // Ground-truth form state
  const [truthYear, setTruthYear] = useState<string>("");
  const [truthMonth, setTruthMonth] = useState<string>("");
  const [truthSource, setTruthSource] = useState<string>("data_plate");
  const [truthNotes, setTruthNotes] = useState<string>("");
  const [truthSubmitting, setTruthSubmitting] = useState(false);
  const [truthSubmitted, setTruthSubmitted] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APPLIANCE_BRANDS;
    return APPLIANCE_BRANDS.filter((b) => b.name.toLowerCase().includes(q));
  }, [query]);

  async function handleDecode() {
    if (!brand.trim() || !model.trim()) {
      toast.error("Brand and model number are required.");
      return;
    }
    setDecoding(true);
    setResult(null);
    setTruthSubmitted(false);
    setTruthYear("");
    setTruthMonth("");
    setTruthNotes("");
    try {
      const r = await decode({ data: { brand, modelNumber: model, serialNumber: serial.trim() || null } });
      setResult(r as DecodedAppliance);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Decode failed.");
    } finally {
      setDecoding(false);
    }
  }

  async function handleSubmitTruth() {
    if (!result) return;
    const year = Number(truthYear);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1950 || year > currentYear + 1) {
      toast.error(`Enter a year between 1950 and ${currentYear + 1}.`);
      return;
    }
    setTruthSubmitting(true);
    try {
      await submitTruth({
        data: {
          brand: result.brand,
          modelNumber: result.modelNumber || null,
          serial: result.serialNumber,
          knownYear: year,
          knownMonth: truthMonth ? Number(truthMonth) : null,
          source: (truthSource as "data_plate" | "receipt" | "owner_manual" | "other") || null,
          notes: truthNotes.trim() || null,
          decoderYear: result.manufactureDate?.year ?? null,
          decoderConfidence: result.confidence ?? null,
        },
      });
      setTruthSubmitted(true);
      toast.success("Thanks — your known year is saved.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setTruthSubmitting(false);
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
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Appliance Type</span>
            <div className="flex items-center gap-2">
              <span className="text-right text-sm font-semibold">
                {[result.applianceType, result.platform].filter(Boolean).join(" · ") || "—"}
              </span>
              <ApplianceTypeEditor
                brand={result.brand}
                model={result.modelNumber}
                currentType={result.applianceType}
                currentSubType={result.platform}
                size="icon"
                onSaved={(t, s) =>
                  setResult((prev) =>
                    prev
                      ? { ...prev, applianceType: t, platform: s, typeSource: "user_override" }
                      : prev,
                  )
                }
              />
            </div>
          </div>
          {result.typeSource === "user_override" ? (
            <div className="-mt-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Type corrected by user
            </div>
          ) : null}
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
          {result.ageProvider ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {result.ageProvider.source === "appliance_age_api" || result.ageProvider.source === "cache" ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                  Verified by Appliance Age Finder{result.ageProvider.cached ? " (cached)" : ""}
                </span>
              ) : (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  Local Decoder Fallback
                </span>
              )}
              {result.ageProvider.responseTimeMs ? (
                <span className="text-[10px] text-muted-foreground">{result.ageProvider.responseTimeMs} ms</span>
              ) : null}
            </div>
          ) : null}
          {result.ageProvider?.alternativeYears && result.ageProvider.alternativeYears.length > 0 ? (
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Alternative Years
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {result.ageProvider.alternativeYears.map((a) => (
                  <li key={a.year} className="flex justify-between gap-2">
                    <span>
                      {a.month ? MONTHS[a.month] + " " : ""}
                      {a.year}
                    </span>
                    <span className="font-mono">{a.confidencePercent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.manufactureDate?.year && result.confidence === "Low" ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <span className="rounded-full border border-amber-400/60 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                Best guess
              </span>
              <span>
                Multiple candidate years — confirm on the data plate if it matters.
              </span>
            </div>
          ) : null}
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
                Evidence · {result.corroboration.hitCount} source
                {result.corroboration.hitCount === 1 ? "" : "s"}
                {result.corroboration.sourceTypes && result.corroboration.sourceTypes.length
                  ? ` across ${result.corroboration.sourceTypes.join(", ")}`
                  : ""}
                {result.corroboration.cached ? " (cached)" : ""}
              </summary>
              {result.corroboration.retailerSignal ? (
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      result.corroboration.retailerSignal === "discontinued"
                        ? "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                        : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                    }`}
                  >
                    {result.corroboration.retailerSignal === "discontinued"
                      ? "Discontinued at retail"
                      : "Still sold at retail"}
                  </span>
                </div>
              ) : null}
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
                    <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {h.sourceType ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                          {h.sourceType}
                        </span>
                      ) : null}
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {h.trust.replace("_", " ")}
                      </span>
                      {h.year ? <span>cites {h.year}</span> : null}
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

          {result.manufactureDate?.year ? (
            <details className="rounded-lg border border-border bg-background/40 p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Know the actual year? Help us improve
              </summary>
              {truthSubmitted ? (
                <p className="mt-2 text-xs text-emerald-300">
                  Saved — thanks for helping train the decoder.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Year</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="2018"
                        value={truthYear}
                        onChange={(e) => setTruthYear(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Month (optional)</Label>
                      <select
                        value={truthMonth}
                        onChange={(e) => setTruthMonth(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {MONTHS.slice(1).map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Source</Label>
                    <select
                      value={truthSource}
                      onChange={(e) => setTruthSource(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="data_plate">Data plate</option>
                      <option value="receipt">Receipt / invoice</option>
                      <option value="owner_manual">Owner manual</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Notes (optional)</Label>
                    <Input
                      placeholder="e.g. data plate reads 04/2018"
                      value={truthNotes}
                      onChange={(e) => setTruthNotes(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <Button
                    onClick={handleSubmitTruth}
                    disabled={truthSubmitting || !truthYear}
                    className="h-10 w-full"
                  >
                    {truthSubmitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                    ) : (
                      "Submit known year"
                    )}
                  </Button>
                </div>
              )}
            </details>
          ) : null}

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
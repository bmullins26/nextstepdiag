import { useMemo, useState } from "react";
import { formatAge, manufactureRange, completedYears } from "@/lib/age-decoder/age-math";
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
import { DecodeLogicPanel, type DecodeLogic } from "@/components/decode-logic-panel";
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
  manufactureDate: { year: number; month?: number | null; week?: number | null; rangeStart: string; rangeEnd: string } | null;
  ageYears: number | null;
  /** Floored age text: "X yr", or "X–Y yr" when only the year is known. */
  ageText?: string | null;
  ageStatus?: "ok" | "ambiguous" | "unknown";
  normalizedSerial?: string;
  /** Internal: set to "tech_picked" when the tech tapped a candidate. */
  datePickedBy?: "tech_picked" | null;
  confidence: string;
  decodedBreakdown: string;
  ruleFamily: string;
  ruleName?: string;
  ruleBreakdown: string;
  notes: string;
  unknownReason?: string | null;
  candidates?: Array<{ year: number; month: number | null; week: number | null }>;
  reconciled?: {
    bestYear: number | null;
    bestMonth: number | null;
    sources: Array<{ kind: string; year: number; month?: number | null; label: string; detail?: string }>;
  } | null;
  decodeLogic?: DecodeLogic | null;
  factoryRecord?: { date: string; warrantyStatus: string | null } | null;
};

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function humanReason(r: string): string {
  switch (r) {
    case "unsupported_manufacturer":
      return "we don't have a decoder for this manufacturer yet.";
    case "invalid_serial_format":
      return "this serial format isn't supported yet — read the date on the data plate.";
    case "missing_date_code":
      return "this serial doesn't contain a date code (some brands print it elsewhere on the data plate).";
    case "ambiguous_year_cycle":
      return "the year code repeats and none of the dates could be used — read the date on the data plate.";
    case "insufficient_information":
      return "not enough information was provided.";
    case "low_confidence":
      return "more than one date fits — read the date on the data plate.";
    case "year_not_in_table":
      return "format recognized, year not in the published table — read the date on the plate.";
    case "kenmore_prefix_needed":
      return "need the Kenmore model number's first 3 digits to know who built it.";
    case "no_candidate_fits":
      return "none of the decoded dates fit the other information — read the date on the data plate.";
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
  const [plateDate, setPlateDate] = useState("");
  const [readOnPlate, setReadOnPlate] = useState(false);
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
      const r = await decode({ data: { brand, modelNumber: model, serialNumber: serial.trim() || null, plateDate: plateDate.trim() || null } });
      setResult(r as DecodedAppliance);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Decode failed.");
    } finally {
      setDecoding(false);
    }
  }

  async function handleVerifyAndStart() {
    if (!brand.trim() || !model.trim()) {
      toast.error("Brand and model number are required.");
      return;
    }
    setDecoding(true);
    try {
      const r = await decode({ data: { brand, modelNumber: model, serialNumber: serial.trim() || null, plateDate: plateDate.trim() || null } });
      const decoded = r as DecodedAppliance;
      // Fast-track: identification is enough to start diagnosis even if age lookup didn't succeed.
      const ready: DecodedAppliance = {
        ...decoded,
        identified: decoded.identified || !!(decoded.manufacturer || decoded.brand),
      };
      setResult(ready);
      onConfirm(ready);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Decode failed.");
    } finally {
      setDecoding(false);
    }
  }

  /** Tech tapped a candidate: use it for this session (internally tech_picked). */
  async function pickCandidate(c: { year: number; month: number | null; week: number | null }) {
    if (!result) return;
    const now = new Date();
    const r = manufactureRange(c.year, c.month, c.week);
    setResult({
      ...result,
      manufactureDate: { year: c.year, month: c.month ?? r.month, week: c.week, rangeStart: r.start, rangeEnd: r.end },
      ageYears: completedYears(r.start, now),
      ageText: formatAge({ year: c.year, month: c.month, week: c.week }, now),
      ageStatus: "ok",
      datePickedBy: "tech_picked",
    });
    // Counts toward learning only when the tech read it on the plate.
    if (readOnPlate) {
      try {
        await submitTruth({
          data: {
            brand: result.brand,
            modelNumber: result.modelNumber || null,
            serial: result.serialNumber,
            knownYear: c.year,
            knownMonth: c.month,
            source: "data_plate",
            notes: "Picked from decoded dates; read on plate",
            decoderYear: null,
            decoderConfidence: null,
          },
        });
      } catch {
        /* non-blocking */
      }
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
          <Label htmlFor="serial" className="text-xs uppercase tracking-wide text-muted-foreground">Serial Number (optional)</Label>
          <Input
            id="serial"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="C81234567"
            className="h-12 w-full text-base"
          />
          <p className="text-[11px] text-muted-foreground">
            Age lookup is optional and does not affect diagnostics.
          </p>
        </div>

        {/* Date printed on plate */}
        <div className="space-y-1.5">
          <Label htmlFor="plate-date" className="text-xs uppercase tracking-wide text-muted-foreground">Date printed on plate (optional)</Label>
          <Input
            id="plate-date"
            value={plateDate}
            onChange={(e) => setPlateDate(e.target.value)}
            placeholder="2019.03, 03/2019, MFD 2019-03 or FD0103"
            className="h-12 w-full text-base"
          />
          <p className="text-[11px] text-muted-foreground">If the plate shows a build date, enter it — it's used as the answer.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleVerifyAndStart}
            disabled={decoding}
            className="h-14 w-full text-base font-bold"
          >
            {decoding ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</>
            ) : (
              "Verify & Start Diagnosis"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDecode}
            disabled={decoding}
            className="h-11 w-full text-sm"
          >
            Lookup Age (optional)
          </Button>
        </div>
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
          {result.normalizedSerial && result.normalizedSerial !== serial.trim() ? (
            <div className="-mt-1 text-[11px] text-muted-foreground">Read as: <span className="font-mono">{result.normalizedSerial}</span></div>
          ) : null}
          {result.ageStatus === "ambiguous" && !result.manufactureDate ? (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
              <div className="text-sm font-semibold">
                Built {Array.from(new Set((result.candidates ?? []).map((c) => c.year))).join(" or ")} — check the plate
              </div>
              <div className="flex flex-wrap gap-2">
                {(result.candidates ?? []).map((c) => (
                  <Button
                    key={`${c.year}-${c.month ?? ""}-${c.week ?? ""}`}
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => pickCandidate(c)}
                  >
                    {c.month ? MONTHS[c.month] + " " : ""}{c.year}{c.week ? ` (wk ${c.week})` : ""}
                  </Button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={readOnPlate} onChange={(e) => setReadOnPlate(e.target.checked)} className="h-4 w-4" />
                I read this on the plate
              </label>
            </div>
          ) : (
            <>
              <KV
                k="Built"
                v={
                  result.manufactureDate?.year
                    ? `${result.manufactureDate.month ? MONTHS[result.manufactureDate.month] + " " : ""}${result.manufactureDate.year}${result.manufactureDate.week ? ` (week ${result.manufactureDate.week})` : ""}`
                    : "Unknown"
                }
              />
              <KV k="Age" v={result.ageText ?? "Unknown"} />
            </>
          )}
          {result.reconciled && result.reconciled.sources.length > 0 && result.ageStatus === "ok" ? (
            <div className="text-[11px] text-muted-foreground">
              From: {result.datePickedBy === "tech_picked" ? "Picked on site" : result.reconciled.sources[0]!.label}
            </div>
          ) : null}
          <KV k="Applied Rule" v={result.ruleName || result.ruleFamily || "—"} />
          {result.decodeLogic ? <DecodeLogicPanel logic={result.decodeLogic} /> : null}

          {result.ageYears == null && result.unknownReason ? (
            <p className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
              Age lookup is optional and does not affect diagnostics. ({humanReason(result.unknownReason)})
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

          {result.manufactureDate?.year || result.ageStatus === "ambiguous" ? (
            <details className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-amber-200">
                Not right? Report the correct year
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
        <RepairInsightsCard model={result.modelNumber} brand={result.manufacturer || result.brand} />
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
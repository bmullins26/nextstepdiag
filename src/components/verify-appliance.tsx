import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Camera,
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
import { APPLIANCE_BRANDS, findBrand } from "@/lib/appliance-brands";
import { decodeAppliance, extractTagFromImage } from "@/lib/serial-decode.functions";
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
  decodedBreakdown: string;
  ruleFamily: string;
  ruleName?: string;
  ruleBreakdown: string;
  notes: string;
  unknownReason?: string | null;
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
  const [ocrBusy, setOcrBusy] = useState(false);
  const [result, setResult] = useState<DecodedAppliance | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const decode = useServerFn(decodeAppliance);
  const ocr = useServerFn(extractTagFromImage);

  const brandMeta = useMemo(() => findBrand(brand), [brand]);
  const ocrEnabled = Boolean(brandMeta?.ocrSupported);

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

  async function handleFile(file: File) {
    if (!ocrEnabled) return;
    setOcrBusy(true);
    try {
      const dataUrl = await compressImage(file, 1600, 0.78);
      const out = await ocr({ data: { imageDataUrl: dataUrl, brandHint: brand } });
      if (out.brand && !brand) setBrand(out.brand);
      if (out.modelNumber) setModel(out.modelNumber);
      if (out.serialNumber) setSerial(out.serialNumber);
      toast.success("Tag read — review the fields and tap Decode.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the tag — try a sharper photo.");
    } finally {
      setOcrBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
                      {b.ocrSupported && (
                        <Camera className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
                      )}
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

        {/* Serial + camera */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="serial" className="text-xs uppercase tracking-wide text-muted-foreground">Serial Number</Label>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {ocrEnabled ? "Tag photo available" : brand ? "Photo unsupported" : "Select brand first"}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              id="serial"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="C81234567"
              className="h-12 flex-1 text-base"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <button
              type="button"
              disabled={!ocrEnabled || ocrBusy}
              onClick={() => fileRef.current?.click()}
              title={ocrEnabled ? "Photograph the data plate" : "Image recognition coming soon for this brand"}
              className={`flex h-12 w-12 items-center justify-center rounded-md border transition ${
                ocrEnabled
                  ? "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/25"
                  : "border-border bg-muted/30 text-muted-foreground/60"
              }`}
            >
              {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-5 w-5" />}
            </button>
          </div>
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
          <KV k="Confidence" v={result.confidence} />
          <KV k="Applied Rule" v={result.ruleName || result.ruleFamily || "—"} />
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

// Re-encode an image to a smaller JPEG to keep upload under ~1.5 MB.
async function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Read failed"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image decode failed"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
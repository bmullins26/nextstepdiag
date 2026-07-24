import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLIANCE_BRANDS } from "@/lib/appliance-brands";
import { UpgradeDialog } from "@/components/paywall/upgrade-dialog";
import {
  researchErrorCode,
  type ErrorCodeResult,
  type ErrorCodeConfidence,
} from "@/lib/error-codes.functions";

const APPLIANCE_TYPES = [
  "Washer",
  "Dryer",
  "Dishwasher",
  "Refrigerator",
  "Range",
  "Oven",
  "Microwave",
  "Freezer",
] as const;

export const Route = createFileRoute("/_authenticated/error-codes")({
  head: () => ({
    meta: [
      { title: "Error Codes — NextStep Diagnostics" },
      {
        name: "description",
        content:
          "Research appliance fault codes by brand and model. AI-powered lookup with cited sources, cached for speed.",
      },
    ],
  }),
  component: ErrorCodesPage,
});

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; row: ErrorCodeResult; source: "cache" | "fresh" }
  | { kind: "missing"; brand: string; code: string };

function ErrorCodesPage() {
  const research = useServerFn(researchErrorCode);
  const [brand, setBrand] = useState<string>("Whirlpool");
  const [applianceType, setApplianceType] = useState<string>("Washer");
  const [modelNumber, setModelNumber] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [quotaOpen, setQuotaOpen] = useState(false);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    const m = modelNumber.trim();
    if (!m) {
      toast.error("Enter the appliance model number.");
      return;
    }
    if (!c) {
      toast.error("Enter an error code.");
      return;
    }
    setResult({ kind: "loading" });
    try {
      const r = await research({
        data: { brand, applianceType, modelNumber: m, code: c },
      });
      if ((r as any).quotaExceeded) {
        setQuotaOpen(true);
        setResult({ kind: "idle" });
        return;
      }
      if (r.notFound) setResult({ kind: "missing", brand, code: c });
      else setResult({ kind: "found", row: r.result, source: r.source });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed.");
      setResult({ kind: "idle" });
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            Reference
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">
            Error Code Lookup
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Researches the fault code from manufacturer service docs and trusted
            repair sources. Results are cached so the next lookup is instant.
          </p>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
          <form onSubmit={onLookup} className="glass-card space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger id="brand" className="h-11">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {APPLIANCE_BRANDS.filter((b) => b.name !== "Other").map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appliance-type">
                Appliance Type{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Select value={applianceType} onValueChange={setApplianceType}>
                <SelectTrigger id="appliance-type" className="h-11">
                  <SelectValue placeholder="Select an appliance type" />
                </SelectTrigger>
                <SelectContent>
                  {APPLIANCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">Model Number</Label>
              <Input
                id="model"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="e.g. WTW8127LW"
                className="h-11 font-mono uppercase tracking-wide"
                autoComplete="off"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Required for model-specific accuracy.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code">Error Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. F7E1, SUD, OE"
                className="h-11 font-mono uppercase tracking-wide"
                autoComplete="off"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Codes are case-insensitive.
              </p>
            </div>

            <Button
              type="submit"
              className="h-11 w-full font-bold"
              disabled={result.kind === "loading"}
            >
              {result.kind === "loading" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {result.kind === "loading" ? "Researching…" : "Look up code"}
            </Button>
          </form>

          <section className="glass-card min-h-[360px] p-5">
            <ResultView state={result} />
          </section>
        </div>
      </div>
      <UpgradeDialog
        open={quotaOpen}
        onOpenChange={setQuotaOpen}
        reason="You've reached your free monthly AI lookup limit. Upgrade to continue."
      />
    </main>
  );
}

const CONFIDENCE_META: Record<
  ErrorCodeConfidence,
  { label: string; className: string }
> = {
  high: {
    label: "High confidence",
    className: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  },
  medium: {
    label: "Medium confidence",
    className: "bg-primary/15 text-primary ring-primary/30",
  },
  low: {
    label: "Low confidence — verify",
    className: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
};

function ResultView({ state }: { state: Result }) {
  if (state.kind === "idle") {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">
          Enter the brand, model number, and fault code on the left. We'll
          research it against manufacturer service docs and cache the answer
          for next time.
        </p>
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="mt-3 text-sm">Researching service documentation…</p>
        <p className="mt-1 text-[11px]">First lookups can take a few seconds.</p>
      </div>
    );
  }
  if (state.kind === "missing") {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-base font-bold">
          Couldn't research {state.brand} · {state.code.toUpperCase()}
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Try a related code, or open Documents to upload the tech sheet and
          ask the assistant directly.
        </p>
      </div>
    );
  }

  const r = state.row;
  const conf = CONFIDENCE_META[r.confidence];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/15 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-primary">
          {r.brand}
          {r.appliance_type ? ` · ${r.appliance_type}` : ""}
          {r.model_number ? ` · ${r.model_number}` : ""} · {r.code}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${conf.className}`}
        >
          {conf.label}
        </span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {state.source === "cache" ? "Cached" : "Freshly researched"}
        </span>
      </div>
      <h2 className="text-xl font-black leading-snug">{r.meaning}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Common Causes" tone="secondary" items={r.common_causes} />
        <Section title="Recommended Tests" tone="primary" items={r.recommended_tests} />
      </div>

      {r.affected_components.length > 0 && (
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Affected Components
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.affected_components.map((c, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {r.service_notes && (
        <div className="rounded-xl border border-secondary/40 bg-secondary/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">
            Service Notes
          </div>
          <p className="mt-2 text-sm leading-relaxed">{r.service_notes}</p>
        </div>
      )}

      {r.sources.length > 0 && (
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Sources
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {r.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  {s.title || s.url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "primary" | "secondary";
  items: string[];
}) {
  const isPrimary = tone === "primary";
  return (
    <div
      className={`rounded-xl border p-4 ${
        isPrimary
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background/40"
      }`}
    >
      <div
        className={`text-[11px] font-bold uppercase tracking-wider ${
          isPrimary ? "text-primary" : "text-secondary"
        }`}
      >
        {title}
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground">No data.</li>
        )}
        {items.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                isPrimary ? "bg-primary" : "bg-secondary"
              }`}
            />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
// Live 7-step service-call pipeline shown on the Diagnose screen.
// Steps: decode → warranty → recalls → diagnosis → test plan → parts → homeowner summary.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, ClipboardCopy, ExternalLink, Loader2, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeWarranty } from "@/lib/warranty/rules";
import { PART_SUPPLIERS } from "@/lib/parts/suppliers";
import { scanRecalls, generateCloseout, type Closeout, type RecallHit, type KnownIssue } from "@/lib/service-call.functions";

type Props = {
  brand: string;
  applianceType: string;
  modelNumber: string;
  manufactureYear: number | null;
  ageYears: number | null;
  complaint: string;
  failures: string[];
  history: { question: string; answer: string }[];
  diagnosisReady: boolean;
};

const STEPS = ["Decode", "Warranty", "Recalls", "Diagnosis", "Tests", "Parts", "Summary"];

export function ServiceCallPipeline(p: Props) {
  const warranty = useMemo(
    () => computeWarranty({ brand: p.brand, applianceType: p.applianceType, manufactureYear: p.manufactureYear }),
    [p.brand, p.applianceType, p.manufactureYear],
  );
  const scan = useServerFn(scanRecalls);
  const close = useServerFn(generateCloseout);
  const [recalls, setRecalls] = useState<{ recalls: RecallHit[]; knownIssues: KnownIssue[]; cpscError: string | null } | null>(null);
  const [closeout, setCloseout] = useState<Closeout | null>(null);
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    let off = false;
    setRecalls(null);
    scan({ data: { brand: p.brand, applianceType: p.applianceType, modelNumber: p.modelNumber } })
      .then((r) => !off && setRecalls(r))
      .catch(() => !off && setRecalls({ recalls: [], knownIssues: [], cpscError: "Lookup failed" }));
    return () => { off = true; };
  }, [p.brand, p.modelNumber]);

  async function build() {
    setBuilding(true);
    try {
      const r = await close({ data: {
        brand: p.brand, applianceType: p.applianceType, modelNumber: p.modelNumber,
        complaint: p.complaint, failures: p.failures.slice(0, 5), history: p.history.slice(-40),
        ageYears: p.ageYears, warrantyHeadline: warranty.headline,
      } });
      if (r.ok) { setCloseout(r.closeout); setDone(new Set()); } else toast.error(r.error);
    } catch { toast.error("Couldn't build the closeout."); }
    finally { setBuilding(false); }
  }

  const reached = [true, warranty.status !== "unknown", !!recalls, p.failures.length > 0, !!closeout, !!closeout, !!closeout];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary">Service call pipeline</div>
        <ol className="grid grid-cols-7 gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-1 text-center">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${reached[i] ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                {reached[i] ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="text-[9px] leading-tight text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
          <ShieldCheck className="h-3.5 w-3.5" /> Warranty intelligence
        </div>
        <p className="mt-1 text-sm font-semibold">{warranty.headline}</p>
        {warranty.items.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {warranty.items.map((it) => (
              <li key={it.component} className="flex justify-between gap-2">
                <span className={it.active ? "text-foreground" : "text-muted-foreground line-through"}>
                  {it.component} · {it.years} yr {it.scope === "parts_only" ? "parts" : "parts & labor"}
                </span>
                <span className="font-mono text-muted-foreground">{it.expiresYear}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">Typical manufacturer terms from build date. Confirm with proof of purchase.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
          <AlertTriangle className="h-3.5 w-3.5" /> Recalls & known issues
        </div>
        {!recalls ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking U.S. recall database…</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            {recalls.recalls.length > 0 ? recalls.recalls.map((r, i) => (
              <div key={i} className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
                <div className="font-semibold text-destructive">{r.title}</div>
                <div className="text-muted-foreground">{[r.date, r.hazard].filter(Boolean).join(" · ")}</div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline">View recall</a>}
              </div>
            )) : (
              <p className="text-xs text-muted-foreground">{recalls.cpscError ? `Recall check unavailable (${recalls.cpscError}).` : "No open U.S. recalls found for this model."}</p>
            )}
            {recalls.knownIssues.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">Known failures on this series</div>
                <ul className="mt-1 list-disc pl-4 text-xs">{recalls.knownIssues.map((k) => <li key={k.text}>{k.text}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>

      {p.diagnosisReady && (
        <div className="rounded-2xl border border-primary/50 bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Tests · Parts · Customer
            </div>
            <Button size="sm" onClick={build} disabled={building}>
              {building ? <Loader2 className="h-4 w-4 animate-spin" /> : closeout ? "Rebuild" : "Build closeout"}
            </Button>
          </div>
          {!closeout && !building && <p className="mt-2 text-xs text-muted-foreground">Get an ordered test plan, likely OEM parts, and a ready-to-send homeowner text.</p>}
          {closeout && (
            <div className="mt-3 space-y-4">
              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">Test sequence</div>
                <ol className="mt-1 space-y-1.5">
                  {closeout.testPlan.map((t, i) => (
                    <li key={i}>
                      <button
                        onClick={() => setDone((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm ${done.has(i) ? "border-primary bg-primary/10" : "border-border"}`}
                      >
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${done.has(i) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                          {done.has(i) && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0"><span className="font-semibold">{t.step}</span>{t.expected && <span className="block font-mono text-xs text-muted-foreground">Expect: {t.expected}</span>}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">Likely parts</div>
                <ul className="mt-1 space-y-2">
                  {closeout.parts.map((pt, i) => {
                    const q = pt.partNumber || `${p.modelNumber} ${pt.name}`;
                    return (
                      <li key={i} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex justify-between gap-2"><span className="font-semibold">{pt.name}</span><span className="text-[10px] uppercase text-muted-foreground">{pt.confidence}</span></div>
                        {pt.partNumber && <div className="font-mono text-xs text-primary">{pt.partNumber}</div>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {PART_SUPPLIERS.map((s) => (
                            <a key={s.id} href={s.url(q)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary">
                              {s.label} <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">Part numbers are suggestions — confirm against the model's parts diagram before ordering.</p>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><MessageSquare className="h-3 w-3" /> Homeowner message</div>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-background/40 p-3 text-sm">{closeout.homeownerMessage}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(closeout.homeownerMessage); toast.success("Copied"); }}>
                    <ClipboardCopy className="mr-1 h-4 w-4" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`sms:?&body=${encodeURIComponent(closeout.homeownerMessage)}`}>Text it</a>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

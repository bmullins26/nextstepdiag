// Live 7-step service-call pipeline shown on the Diagnose screen.
// Steps: decode → warranty → recalls → diagnosis → test plan → parts → homeowner summary.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, ClipboardCopy, ExternalLink, Loader2, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeWarranty } from "@/lib/warranty/rules";
import { PART_SUPPLIERS } from "@/lib/parts/suppliers";
import { scanRecalls, generateCloseout, lookupFactoryWarranty, preloadPartsCatalog, type Closeout, type RecallHit, type KnownIssue } from "@/lib/service-call.functions";
import { warrantyRecordLabel } from "@/lib/technician-display";

type Props = {
  brand: string;
  applianceType: string;
  modelNumber: string;
  serialNumber?: string;
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
  type UiPart = Closeout["parts"][number] & { verified?: boolean; price?: number | null; url?: string | null };
  const [closeout, setCloseout] = useState<(Omit<Closeout, "parts"> & { parts: UiPart[] }) | null>(null);
  const [partsSource, setPartsSource] = useState<{ name: string; modelUrl: string | null; count: number; internal?: boolean } | null>(null);
  const preload = useServerFn(preloadPartsCatalog);
  const [diagram, setDiagram] = useState<"loading" | { provider: string | null; internal: boolean; count: number; modelUrl: string | null } | null>(null);
  // Load this model's parts diagrams up front (saved copy first, outside sites only once).
  useEffect(() => {
    let off = false;
    setDiagram("loading");
    preload({ data: { brand: p.brand, modelNumber: p.modelNumber } })
      .then((r) => !off && setDiagram(r))
      .catch(() => !off && setDiagram(null));
    return () => { off = true; };
  }, [p.brand, p.modelNumber]);
  const factoryFn = useServerFn(lookupFactoryWarranty);
  const [factory, setFactory] = useState<Awaited<ReturnType<typeof lookupFactoryWarranty>> | "loading" | null>(null);
  useEffect(() => {
    if (!p.serialNumber || p.serialNumber.length < 3) { setFactory(null); return; }
    let off = false;
    setFactory("loading");
    factoryFn({ data: { brand: p.brand, modelNumber: p.modelNumber, serialNumber: p.serialNumber } })
      .then((r) => !off && setFactory(r))
      .catch(() => !off && setFactory(null));
    return () => { off = true; };
  }, [p.brand, p.modelNumber, p.serialNumber]);
  const ent = factory && factory !== "loading" ? factory.entitlement : null;
  // Only serial-specific fields count as verification; model-level coverage alone does not.
  const entSerial = !!ent && !!(ent.manufacturedDate || ent.shippedDate || ent.purchaseDate || ent.standard.partsExpires || ent.standard.laborExpires);
  const verdict = useMemo(() => {
    const exp = ent?.standard.laborExpires || ent?.standard.partsExpires;
    if (exp && !Number.isNaN(Date.parse(exp))) return { inWarranty: Date.parse(exp) > Date.now(), estimated: false };
    if (p.manufactureYear) return { inWarranty: warranty.items.some((i) => i.active && i.scope !== "parts_only"), estimated: true };
    return null;
  }, [ent, p.manufactureYear, warranty]);
  const [building, setBuilding] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    let off = false;
    setRecalls(null);
    scan({ data: { brand: p.brand, applianceType: p.applianceType, modelNumber: p.modelNumber } })
      .then((r) => !off && setRecalls(r))
      .catch(() => !off && setRecalls({ recalls: [], knownIssues: [], cpscError: "unavailable" }));
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
      if (r.ok) { setCloseout(r.closeout); setPartsSource(r.partsSource); setDone(new Set()); } else toast.error(r.error);
    } catch { toast.error("Couldn't build the closeout."); }
    finally { setBuilding(false); }
  }

  const reached = [true, !!ent || warranty.status !== "unknown", !!recalls, p.failures.length > 0, !!closeout, !!closeout, !!closeout];

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
        <p className="mt-2 text-[11px] text-muted-foreground">
          {diagram === "loading" ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading this model's parts diagrams…</>
            : diagram && diagram.count > 0 ? <>Parts diagrams: {diagram.count} parts {diagram.internal ? "from NextStep's saved library" : `pulled from ${diagram.provider} and saved for next time`}.{diagram.modelUrl && <> <a className="underline" href={diagram.modelUrl} target="_blank" rel="noreferrer">Open diagrams</a></>}</>
            : "No parts diagram found for this model — part suggestions will be marked unconfirmed."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-primary">
          <ShieldCheck className="h-3.5 w-3.5" /> Warranty intelligence
        </div>
        {factory === "loading" && (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking factory warranty records…</p>
        )}
        {ent ? (
          <div className="mt-2 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${/in warranty/i.test(ent.markedAs ?? "") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{ent.markedAs ?? "Status unknown"}</span>
              <span className="text-[10px] text-muted-foreground">{warrantyRecordLabel(entSerial)}</span>
              {verdict && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${verdict.inWarranty ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{verdict.inWarranty ? "In warranty" : "Out of warranty"}{verdict.estimated ? " (estimate)" : ""}</span>}
            </div>
            {ent.productName && <p className="text-sm font-semibold">{ent.productName}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-muted-foreground">{!ent.manufacturedDate && ent.shippedDate ? "Shipped" : "Built"}</div><div className="font-mono">{ent.manufacturedDate ?? ent.shippedDate ?? (p.manufactureYear ? `${p.manufactureYear} (decoded)` : "—")}</div></div>
              <div><div className="text-muted-foreground">Purchased</div><div className="font-mono">{ent.purchaseDate ?? "Not on file"}</div></div>
              <div><div className="text-muted-foreground">Parts until</div><div className="font-mono">{ent.standard.partsExpires ?? (p.manufactureYear ? `~${p.manufactureYear + 1} (est.)` : "—")}</div></div>
              <div><div className="text-muted-foreground">Labor until</div><div className="font-mono">{ent.standard.laborExpires ?? (p.manufactureYear ? `~${p.manufactureYear + 1} (est.)` : "—")}</div></div>
            </div>
            {ent.extended.length > 0 && (
              <ul className="space-y-1">
                {ent.extended.map((x) => (
                  <li key={x.component} className="flex justify-between gap-2">
                    <span>{x.component} · {x.partsMonths} parts</span>
                    <span className="font-mono text-muted-foreground">{x.partsExpires}</span>
                  </li>
                ))}
              </ul>
            )}
            {ent.notices.length > 0 && ent.notices.map((n, i) => (
              <div key={i} className="rounded-lg border border-primary/40 bg-primary/10 p-2">
                <span className="font-semibold">{n.number}</span> {n.description}{n.expires ? ` · until ${n.expires}` : ""}
              </div>
            ))}
            {ent.history.length > 0 && (
              <details className="rounded-lg border border-border p-2" open>
                <summary className="cursor-pointer font-semibold">Prior warranty repairs ({ent.history.length})</summary>
                <ul className="mt-2 space-y-2">
                  {ent.history.map((h, i) => (
                    <li key={i} className="border-l-2 border-primary/50 pl-2">
                      <div className="font-mono text-muted-foreground">{h.date} · {h.claimNumber}</div>
                      {h.complaint && <div>{h.complaint}</div>}
                      {h.parts.length > 0 && <div className="text-muted-foreground">Parts: {h.parts.map((pt) => `${pt.name}${pt.number ? ` (${pt.number})` : ""}`).join(", ")}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : null}
        {!ent && <p className="mt-1 text-sm font-semibold">{warranty.headline}</p>}
        {!ent && warranty.items.length > 0 && (
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
        {!ent && <p className="mt-2 text-[10px] text-muted-foreground">Typical manufacturer terms from build date. Confirm with proof of purchase.</p>}
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
              <p className="text-xs text-muted-foreground">{recalls.cpscError ? "The CPSC recall database didn't respond right now, so recalls weren't checked. You can search saferproducts.gov or the manufacturer's recall page directly." : "No matching CPSC recall records for this model number. This search only covers models listed in CPSC notices — check the manufacturer's recall page to be sure."}</p>
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
                        <div className="flex justify-between gap-2"><span className="font-semibold">{pt.name}</span><span className="text-[10px] uppercase text-muted-foreground">{pt.verified ? "Fits this model" : "Check fit"}</span></div>
                        {pt.partNumber && <div className="font-mono text-xs text-primary">{pt.partNumber}{pt.price != null && <span className="ml-2 text-muted-foreground">${pt.price.toFixed(2)} list price{partsSource ? ` (${partsSource.name})` : ""}</span>}</div>}
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
                {closeout.parts.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No parts on this model's parts list matched the suspected failure.</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {partsSource
                    ? <>Matched against {partsSource.count} parts on this model's diagrams from {partsSource.internal ? `NextStep's saved library (${partsSource.name})` : partsSource.name}.{partsSource.modelUrl && <> <a className="underline" href={partsSource.modelUrl} target="_blank" rel="noreferrer">Open diagrams</a></>}</>
                    : "Couldn't load this model's parts list — part numbers are suggestions, confirm against the parts diagram before ordering."}
                </p>
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

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudOff,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  nextDiagnosticStep,
} from "@/lib/diagnostics.functions";
import { VerifyAppliance, type DecodedAppliance } from "@/components/verify-appliance";
import { ApplianceTypeEditor } from "@/components/appliance-type-editor";
import { OutcomeCapture } from "@/components/outcome-capture";
import { EvidenceList } from "@/components/evidence/evidence-list";
import { InsightFeedbackButtons } from "@/components/community/insight-feedback-buttons";
import type { EvidenceItem } from "@/lib/evidence/types";
import {
  upsertSession,
  getSession,
  listSessions,
  setSessionStatus,
} from "@/lib/sessions.functions";
import { z } from "zod";
import { UpgradeDialog } from "@/components/paywall/upgrade-dialog";

export const Route = createFileRoute("/_authenticated/diagnose")({
  head: () => ({
    meta: [
      { title: "Diagnose — NextStep Diagnostics" },
      { name: "description", content: "Guided appliance diagnostic session." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({ session: z.string().uuid().optional().catch(undefined) })
      .parse(s),
  component: DiagnosePage,
});

type Appliance = DecodedAppliance;

type QA = { question: string; answer: string };

type Step = {
  done: boolean;
  currentFindings: string;
  mostLikelyFailure: string;
  mostLikelyFailures?: string[];
  recommendedNextTest: string;
  safetyWarning?: string;
  reasoning?: string;
  provider?: "lovable";
  providerError?: string | null;
  nextQuestion: { text: string; choices: string[]; allowFreeText: boolean };
  groundingSource?: {
    url: string | null;
    confidence: "exact_model" | "platform_family" | "manufacturer_family" | "low";
    sourceType: string;
    sourceTrust: "oem" | "trusted_reference" | "community" | null;
    platformFamily: string | null;
    displayLabel: string;
    trustLabel: string;
  } | null;
  historicalOutcomes?: {
    scope: "exact_model" | "platform_family" | "manufacturer_type" | "manufacturer" | "none";
    scopeLabel: string;
    sampleSize: number;
    exactModelCount: number;
    totals: { confirmed: number; incorrect: number; partial: number };
    ranked: Array<{ failure: string; share: number; weightedCount: number; rawCount: number }>;
  } | null;
  evidence?: EvidenceItem[];
};

type ResumeRow = {
  id: string;
  status: "active" | "completed" | "abandoned";
  brand: string;
  appliance_type: string;
  model_number: string;
  serial_number: string;
  manufacture_year: number | null;
  age_years: number | null;
  complaint: string;
  findings: string[];
  history: QA[];
  most_likely_failures: string[];
  most_likely_failure: string;
  recommended_next_test: string;
  current_findings_summary: string;
  appliance: Record<string, unknown> | null;
  updated_at: string;
};

function DiagnosePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<1 | 2 | 3>(1);

  // Step 1
  const [appliance, setAppliance] = useState<Appliance | null>(null);

  // Step 2
  const [complaint, setComplaint] = useState("");

  // Step 3
  const [history, setHistory] = useState<QA[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const [thinking, setThinking] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [quotaOpen, setQuotaOpen] = useState(false);
  const next = useServerFn(nextDiagnosticStep);

  // Current Findings (things the tech has already verified before/during the call)
  const [findings, setFindings] = useState<string[]>([]);

  // Document
  // Document analysis removed from Diagnose — lives in /documents now.

  // Session persistence
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [resumeCandidates, setResumeCandidates] = useState<ResumeRow[] | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const hydrated = useRef(false);
  const upsert = useServerFn(upsertSession);
  const fetchSession = useServerFn(getSession);
  const fetchList = useServerFn(listSessions);
  const setStatus = useServerFn(setSessionStatus);

  // Load from ?session= or show resume prompt for actives
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (search.session) {
        try {
          const r = (await fetchSession({ data: { id: search.session } })) as unknown as ResumeRow | null;
          if (!cancelled && r) hydrateFrom(r);
        } catch {/* ignore */}
        return;
      }
      try {
        const rows = (await fetchList({ data: { status: "active" } })) as unknown as ResumeRow[];
        if (!cancelled) setResumeCandidates(rows);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [search.session]);

  function hydrateFrom(r: ResumeRow) {
    hydrated.current = false;
    setSessionId(r.id);
    if (r.brand || r.model_number) {
      const a: Appliance = (r.appliance && Object.keys(r.appliance).length
        ? r.appliance
        : {
            brand: r.brand,
            modelNumber: r.model_number,
            serialNumber: r.serial_number,
            manufacturer: r.brand,
            applianceType: r.appliance_type,
            confidence: "Medium",
            identified: true,
            notes: "",
            ageYears: r.age_years ?? undefined,
          }) as Appliance;
      setAppliance(a);
    }
    setComplaint(r.complaint ?? "");
    setFindings(r.findings ?? []);
    setHistory(r.history ?? []);
    if (r.most_likely_failures?.length || r.most_likely_failure || r.recommended_next_test) {
      setStep({
        done: r.status === "completed",
        currentFindings: r.current_findings_summary ?? "",
        mostLikelyFailure: r.most_likely_failure ?? "",
        mostLikelyFailures: r.most_likely_failures ?? [],
        recommendedNextTest: r.recommended_next_test ?? "",
        nextQuestion: { text: "", choices: [], allowFreeText: false },
      });
    }
    setPhase(r.history?.length || r.complaint ? 3 : r.brand ? 2 : 1);
    setResumeCandidates(null);
    setResumeDismissed(true);
    // Allow autosave after one tick
    setTimeout(() => { hydrated.current = true; }, 100);
  }

  // Autosave (debounced)
  useEffect(() => {
    if (!appliance) return;
    if (!hydrated.current && !sessionId) {
      hydrated.current = true; // first user action after fresh start
    }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const payload = {
          id: sessionId ?? undefined,
          brand: appliance.brand ?? "",
          appliance_type: appliance.applianceType ?? "",
          model_number: appliance.modelNumber ?? "",
          serial_number: appliance.serialNumber ?? "",
          manufacture_year: appliance.manufactureDate?.year ?? null,
          age_years: appliance.ageYears ?? null,
          complaint,
          findings,
          history,
          most_likely_failures: step?.mostLikelyFailures ?? [],
          most_likely_failure: step?.mostLikelyFailure ?? "",
          recommended_next_test: step?.recommendedNextTest ?? "",
          current_findings_summary: step?.currentFindings ?? "",
          appliance: appliance as unknown as Record<string, unknown>,
        };
        const saved = (await upsert({ data: payload })) as { id: string };
        if (saved?.id && !sessionId) setSessionId(saved.id);
        setSaveState("saved");
        setLastSavedAt(Date.now());
      } catch {
        setSaveState("idle");
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliance, complaint, findings, history, step?.mostLikelyFailure, step?.recommendedNextTest, step?.currentFindings]);

  async function startDiagnosis() {
    if (!complaint.trim()) {
      toast.error("Describe the customer complaint to begin.");
      return;
    }
    setPhase(3);
    await advance([], findings);
  }

  async function advance(h: QA[], f: string[] = findings) {
    if (!appliance) return;
    const mfg = (appliance.manufacturer || appliance.brand || "").trim();
    const type = (appliance.applianceType || "").trim();
    const model = (appliance.modelNumber || "").trim();
    if (!mfg || !model) {
      toast.error("Manufacturer and model number are required. Please re-verify the appliance.");
      setPhase(1);
      return;
    }
    setThinking(true);
    try {
      const r = await next({
        data: {
          appliance: {
            manufacturer: mfg,
            applianceType: type || "Unknown",
            modelNumber: model,
            serialNumber: appliance.serialNumber || "",
            manufactureYear: appliance.manufactureDate?.year,
            ageYears: appliance.ageYears ?? undefined,
            platform: appliance.platform || null,
          },
          complaint,
          history: h,
          currentFindings: f,
          sessionId: sessionId ?? null,
        },
      });
      if (r && (r as any).quotaExceeded) {
        setQuotaOpen(true);
        return;
      }
      setStep(r as Step);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Diagnostic engine error.");
    } finally {
      setThinking(false);
    }
  }

  async function answerWith(answer: string) {
    if (!step?.nextQuestion.text || !answer.trim()) return;
    const h = [...history, { question: step.nextQuestion.text, answer: answer.trim() }];
    setHistory(h);
    setFreeText("");
    await advance(h);
  }

  async function goBackOneQuestion() {
    if (history.length === 0) return;
    const h = history.slice(0, -1);
    setHistory(h);
    await advance(h);
  }

  async function rewindTo(index: number) {
    const h = history.slice(0, index);
    setHistory(h);
    await advance(h);
  }

  function resetAll() {
    setPhase(1);
    setAppliance(null);
    setComplaint("");
    setHistory([]);
    setStep(null);
    setFindings([]);
    setSessionId(null);
    setSaveState("idle");
    setLastSavedAt(null);
    setResumeDismissed(true);
    hydrated.current = false;
    navigate({ to: "/diagnose", search: {} });
  }

  async function markCompleted() {
    if (!sessionId) return;
    await setStatus({ data: { id: sessionId, status: "completed" } });
    toast.success("Marked completed. Saved to History.");
    resetAll();
  }
  async function markAbandoned() {
    if (!sessionId) return;
    await setStatus({ data: { id: sessionId, status: "abandoned" } });
    toast.success("Marked abandoned.");
    resetAll();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 pt-3">
        <SaveBadge state={saveState} at={lastSavedAt} />
        <div className="flex items-center gap-2">
          {sessionId && phase === 3 && (
            <>
              <button onClick={markCompleted} className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300">Mark Complete</button>
              <span className="text-muted-foreground">·</span>
              <button onClick={markAbandoned} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Abandon</button>
              <span className="text-muted-foreground">·</span>
            </>
          )}
          <button onClick={resetAll} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> New
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-md px-4 pt-2"><StepBar phase={phase} /></div>

      <div className="mx-auto max-w-md px-4 pb-32 pt-5">
        {!appliance && !resumeDismissed && resumeCandidates && resumeCandidates.length > 0 && (
          <ResumePrompt
            rows={resumeCandidates}
            onResume={(r) => hydrateFrom(r)}
            onStartNew={() => { setResumeDismissed(true); setResumeCandidates(null); }}
          />
        )}

        {phase === 1 && (
          <section className="space-y-5">
            <SectionHead step="STEP 1" title="Verify the appliance" />
            <VerifyAppliance
              onConfirm={(a) => {
                setAppliance(a);
                setPhase(2);
              }}
            />
          </section>
        )}

        {phase === 2 && appliance && (
          <Phase2
            appliance={appliance}
            complaint={complaint}
            setComplaint={setComplaint}
            onBack={() => setPhase(1)}
            onStart={startDiagnosis}
            findings={findings}
            setFindings={setFindings}
            onTypeCorrected={(type, sub) =>
              setAppliance((a) => (a ? { ...a, applianceType: type, platform: sub || a.platform, typeSource: "user_override" } : a))
            }
          />
        )}

        {phase === 3 && appliance && (
          <Phase3
            appliance={appliance}
            complaint={complaint}
            history={history}
            step={step}
            thinking={thinking}
            freeText={freeText}
            setFreeText={setFreeText}
            answerWith={answerWith}
            findings={findings}
            setFindings={setFindings}
            onReevaluate={() => advance(history)}
            onPrevious={goBackOneQuestion}
            onRewindTo={rewindTo}
            onTypeCorrected={(type, sub) =>
              setAppliance((a) => (a ? { ...a, applianceType: type, platform: sub || a.platform, typeSource: "user_override" } : a))
            }
            sessionId={sessionId}
            onOutcomeRecorded={(kind) => {
              if (kind === "pending_repair") return;
              resetAll();
            }}
          />
        )}

        {phase >= 2 && appliance && (
          <div className="mt-6 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
            <FileText className="mr-2 inline h-4 w-4 text-primary" />
            Need help reading a wiring diagram?{" "}
            <Link to="/documents" className="font-semibold text-primary underline-offset-4 hover:underline">
              Open Document Assistant →
            </Link>
          </div>
        )}
      </div>
      <UpgradeDialog
        open={quotaOpen}
        onOpenChange={setQuotaOpen}
        reason="You've reached your free monthly AI lookup limit. Upgrade to keep diagnosing."
      />
    </main>
  );
}

function StepBar({ phase }: { phase: number }) {
  const items = ["Verify", "Complaint", "Diagnose"];
  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-3">
      {items.map((label, i) => {
        const idx = i + 1;
        const active = phase === idx;
        const done = phase > idx;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx}
            </div>
            <span className={`text-xs ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
            {i < items.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Phase2(props: {
  appliance: Appliance; complaint: string; setComplaint: (v: string) => void;
  onBack: () => void; onStart: () => void;
  findings: string[]; setFindings: (f: string[]) => void;
  onTypeCorrected?: (type: string, subType: string) => void;
}) {
  const { appliance, complaint, setComplaint, onBack, onStart, findings, setFindings, onTypeCorrected } = props;
  const { listening, supported, toggle } = useDictation((t) =>
    setComplaint(complaint ? `${complaint} ${t}` : t),
  );
  const examples = [
    "Washer fills and drains but will not spin.",
    "Refrigerator freezer is cold but fresh food section is warm.",
    "Dryer tumbles but does not heat.",
  ];
  return (
    <section className="space-y-5">
      <SectionHead step="STEP 2" title="Customer complaint" />
      <ApplianceChip appliance={appliance} onTypeCorrected={onTypeCorrected} />
      <CurrentFindings findings={findings} setFindings={setFindings} />
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Label htmlFor="complaint" className="text-sm">In the customer's words</Label>
        <Textarea
          id="complaint"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Describe the symptom the customer reports…"
          className="min-h-32 text-base"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={toggle}
            disabled={!supported}
            className="h-11 flex-1"
          >
            {listening ? <><MicOff className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> Voice Input</>}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} className="h-11">Back</Button>
        </div>
        {!supported && (
          <p className="text-xs text-muted-foreground">Voice input not available on this browser.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examples</p>
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => setComplaint(ex)}
            className="block w-full rounded-xl border border-border bg-card/60 p-3 text-left text-sm hover:border-primary/60"
          >
            {ex}
          </button>
        ))}
      </div>

      <Button onClick={onStart} className="h-14 w-full text-base font-bold">
        Start Diagnosis <Send className="ml-2 h-4 w-4" />
      </Button>
    </section>
  );
}

function Phase3(props: {
  appliance: Appliance; complaint: string;
  history: QA[]; step: Step | null; thinking: boolean;
  freeText: string; setFreeText: (v: string) => void;
  answerWith: (a: string) => void;
  findings: string[]; setFindings: (f: string[]) => void;
  onReevaluate: () => void;
  onPrevious: () => void;
  onRewindTo: (index: number) => void;
  onTypeCorrected?: (type: string, subType: string) => void;
  sessionId: string | null;
  onOutcomeRecorded: (kind: "confirmed" | "incorrect" | "partial" | "pending_repair") => void;
}) {
  const { appliance, complaint, history, step, thinking, freeText, setFreeText, answerWith, findings, setFindings, onReevaluate, onPrevious, onRewindTo, onTypeCorrected, sessionId, onOutcomeRecorded } = props;
  const failures = step?.mostLikelyFailures && step.mostLikelyFailures.length > 0
    ? step.mostLikelyFailures
    : step?.mostLikelyFailure ? [step.mostLikelyFailure] : [];
  return (
    <section className="space-y-5">
      <SectionHead step="STEP 3" title="Guided diagnosis" />
      <ApplianceChip appliance={appliance} onTypeCorrected={onTypeCorrected} />
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Complaint</div>
        <p className="mt-1 text-sm">{complaint}</p>
      </div>

      <CurrentFindings findings={findings} setFindings={setFindings} onChange={onReevaluate} />

      {history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Questions Answered ({history.length})
          </div>
          <ol className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Q{i + 1}: {h.question}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-primary">→ {h.answer}</div>
                  <button
                    onClick={() => onRewindTo(i)}
                    className="text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {step && (
        <div className="grid grid-cols-1 gap-3">
          <FindingCard label="Diagnostic Summary" value={step.currentFindings} accent="muted" />
          <div className="rounded-xl border border-primary/50 bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Most Likely Failures</div>
            {failures.length > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {failures.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm font-semibold leading-snug">
                    <span className="text-primary">{i + 1}.</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Gathering evidence…</p>
            )}
            {step.historicalOutcomes && step.historicalOutcomes.sampleSize > 0 ? (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <div className="font-semibold text-primary">
                  {step.historicalOutcomes.scope === "exact_model"
                    ? `Based on ${step.historicalOutcomes.exactModelCount} repair${step.historicalOutcomes.exactModelCount === 1 ? "" : "s"} of this exact model`
                    : `Based on ${step.historicalOutcomes.sampleSize} similar repair${step.historicalOutcomes.sampleSize === 1 ? "" : "s"} · ${step.historicalOutcomes.totals.confirmed} confirmed`}
                </div>
                {step.historicalOutcomes.ranked.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {step.historicalOutcomes.ranked.slice(0, 3).map((r) => (
                      <li key={r.failure} className="flex justify-between gap-2">
                        <span className="truncate">{r.failure}</span>
                        <span className="font-mono">{r.share}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          <FindingCard label="Recommended Next Test" value={step.recommendedNextTest || "—"} accent="secondary" />
          {step.safetyWarning ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <span className="font-semibold uppercase tracking-wide">Safety </span>
              {step.safetyWarning}
            </div>
          ) : null}
          {step.groundingSource && <GroundingCaption source={step.groundingSource} />}
        </div>
      )}

      {step?.evidence && step.evidence.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-primary">Evidence Sources</h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {step.evidence.length} sources · ranked by tier
            </span>
          </div>
          <EvidenceList
            items={step.evidence}
            renderExtras={(item) =>
              item.sourceType === "community_discussion" || item.sourceType === "community_verified" ? (
                <InsightFeedbackButtons item={item} sessionId={sessionId} />
              ) : null
            }
          />
        </div>
      )}

      {step?.done && (step.mostLikelyFailure || (step.mostLikelyFailures?.length ?? 0) > 0) && (
        <OutcomeCapture
          sessionId={sessionId}
          manufacturer={appliance.manufacturer || appliance.brand}
          modelNumber={appliance.modelNumber}
          applianceType={appliance.applianceType}
          platform={appliance.platform ?? null}
          complaint={complaint}
          recommendedFailure={step.mostLikelyFailure || step.mostLikelyFailures?.[0] || ""}
          predictedFailures={step.mostLikelyFailures ?? []}
          predictedConfidence={(step.historicalOutcomes ?? {}) as Record<string, unknown>}
          testsPerformed={history as unknown[]}
          evidenceSnapshot={(step.evidence ?? []) as unknown[]}
          onRecorded={onOutcomeRecorded}
        />
      )}

      <div className="rounded-2xl border border-primary/40 bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {step?.done ? "Diagnosis Complete" : `Question ${history.length + 1}`}
          </div>
          {history.length > 0 && !thinking && (
            <button
              onClick={onPrevious}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Previous Question
            </button>
          )}
        </div>
        {thinking ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Senior tech thinking…
          </div>
        ) : step?.done ? (
          <p className="mt-2 text-base font-semibold">
            You've isolated the failure. Proceed with the recommended next test above.
          </p>
        ) : step ? (
          <>
            <p className="mt-2 text-lg font-bold leading-snug">{step.nextQuestion.text}</p>
            <div className="mt-4 space-y-2">
              {step.nextQuestion.choices.map((c) => (
                <button
                  key={c}
                  onClick={() => answerWith(c)}
                  className="block w-full rounded-xl border border-border bg-background/40 p-4 text-left text-base font-semibold transition hover:border-primary hover:bg-primary/10"
                >
                  {c}
                </button>
              ))}
              {step.nextQuestion.allowFreeText && (
                <div className="flex gap-2 pt-1">
                  <Input
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Measured value or note…"
                    className="h-12"
                  />
                  <Button onClick={() => answerWith(freeText)} disabled={!freeText.trim()} className="h-12">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}


function SectionHead({ step, title }: { step: string; title: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">{step}</div>
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
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

function FindingCard({ label, value, accent }: { label: string; value: string; accent: "primary" | "secondary" | "muted" }) {
  const ring =
    accent === "primary" ? "border-primary/50" : accent === "secondary" ? "border-secondary/60" : "border-border";
  const tag =
    accent === "primary" ? "text-primary" : accent === "secondary" ? "text-secondary" : "text-muted-foreground";
  return (
    <div className={`rounded-xl border ${ring} bg-card p-4`}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${tag}`}>{label}</div>
      <p className="mt-1 text-sm font-semibold leading-snug">{value}</p>
    </div>
  );
}

function ApplianceChip({
  appliance,
  onTypeCorrected,
}: {
  appliance: Appliance;
  onTypeCorrected?: (type: string, subType: string) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-2.5 text-xs">
      <div>
        <div className="flex items-center gap-1 font-bold text-foreground">
          <span>{appliance.manufacturer || appliance.brand} · {appliance.applianceType || "Unknown type"}</span>
          {onTypeCorrected ? (
            <ApplianceTypeEditor
              brand={appliance.brand}
              model={appliance.modelNumber}
              currentType={appliance.applianceType}
              currentSubType={appliance.platform}
              size="icon"
              onSaved={onTypeCorrected}
            />
          ) : null}
        </div>
        <div className="text-muted-foreground">Model {appliance.modelNumber}{appliance.serialNumber ? ` · S/N ${appliance.serialNumber}` : ""}</div>
      </div>
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{appliance.confidence}</span>
    </div>
  );
}

function GroundingCaption({
  source,
}: {
  source: NonNullable<Step["groundingSource"]>;
}) {
  if (source.confidence === "low") {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
        No verified service literature found — diagnosing from symptoms only. Upload the tech sheet for grounded, model-specific guidance.
      </div>
    );
  }
  const trustClass =
    source.sourceTrust === "oem"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : source.sourceTrust === "trusted_reference"
        ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
        : "bg-muted text-muted-foreground border-border";
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <span>Grounded in:</span>
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-foreground underline-offset-2 hover:underline"
        >
          {source.displayLabel}
        </a>
      ) : (
        <span className="font-semibold text-foreground">{source.displayLabel}</span>
      )}
      {source.trustLabel && (
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${trustClass}`}
        >
          {source.trustLabel}
        </span>
      )}
    </div>
  );
}

const FINDING_SUGGESTIONS = [
  "120 VAC Verified",
  "240 VAC Verified",
  "Control Board Receiving Power",
  "Drain Pump Runs",
  "No Fault Codes Present",
  "Lid Lock Tested Good",
  "Thermistor Tested Good",
  "Heater Tested Good",
  "Compressor Running",
  "Capacitor Tested Good",
  "Motor Windings Test Good",
];

function CurrentFindings({
  findings,
  setFindings,
  onChange,
}: {
  findings: string[];
  setFindings: (f: string[]) => void;
  onChange?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  function commitAdd(value: string) {
    const v = value.trim();
    if (!v) return;
    if (findings.includes(v)) {
      toast.error("Already in findings.");
      return;
    }
    setFindings([...findings, v]);
    setDraft("");
    setAdding(false);
  }

  function remove(i: number) {
    setFindings(findings.filter((_, idx) => idx !== i));
    onChange?.();
  }

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditText(findings[i]);
  }

  function commitEdit() {
    if (editingIdx === null) return;
    const v = editText.trim();
    if (!v) return;
    const copy = [...findings];
    copy[editingIdx] = v;
    setFindings(copy);
    setEditingIdx(null);
    setEditText("");
    onChange?.();
  }

  const unusedSuggestions = FINDING_SUGGESTIONS.filter((s) => !findings.includes(s));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wide text-secondary">
          Current Findings
        </div>
        <span className="text-[10px] uppercase text-muted-foreground">
          {findings.length} verified
        </span>
      </div>

      {findings.length === 0 && !adding && (
        <p className="mt-2 text-xs text-muted-foreground">
          Add anything you've already verified — voltage, fault codes, component tests.
        </p>
      )}

      {findings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {findings.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
            >
              {editingIdx === i ? (
                <>
                  <Input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") {
                        setEditingIdx(null);
                        setEditText("");
                      }
                    }}
                    className="h-9 flex-1"
                  />
                  <button
                    onClick={commitEdit}
                    className="text-xs font-semibold text-primary"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 font-semibold">{f}</span>
                  <button
                    onClick={() => startEdit(i)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit finding"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove finding"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitAdd(draft);
                  onChange?.();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="e.g. F7E1 Fault Code Present"
              className="h-10 flex-1"
            />
            <Button
              onClick={() => {
                commitAdd(draft);
                onChange?.();
              }}
              disabled={!draft.trim()}
              className="h-10"
            >
              Add
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="h-10"
            >
              Cancel
            </Button>
          </div>
          {unusedSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    commitAdd(s);
                    onChange?.();
                  }}
                  className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[11px] hover:border-primary hover:text-primary"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
        >
          <Plus className="h-3.5 w-3.5" /> Add Finding
        </button>
      )}
    </div>
  );
}

// --- Web Speech API dictation ---
function useDictation(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  function toggle() {
    if (!supported) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      onText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  return { listening, supported, toggle };
}

function SaveBadge({ state, at }: { state: "idle" | "saving" | "saved"; at: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  if (state === "idle" && !at) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CloudOff className="h-3 w-3" /> Not saved
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  const ago = at ? Math.max(1, Math.round((Date.now() - at) / 1000)) : 0;
  const label = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-primary">
      <Cloud className="h-3 w-3" /> Auto Saved · {label}
    </span>
  );
}

function ResumePrompt({
  rows,
  onResume,
  onStartNew,
}: {
  rows: ResumeRow[];
  onResume: (r: ResumeRow) => void;
  onStartNew: () => void;
}) {
  return (
    <div className="mb-5 rounded-2xl border border-primary/40 bg-card p-5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
        Resume Previous Diagnosis?
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        You have {rows.length} unfinished {rows.length === 1 ? "diagnosis" : "diagnoses"}.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-background/40 p-3">
            <div className="text-sm font-bold">
              {r.appliance_type || "Unspecified"} · {r.brand || "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {r.model_number || "no model"} · {new Date(r.updated_at).toLocaleString()}
            </div>
            {r.complaint && <p className="mt-1 line-clamp-2 text-xs">{r.complaint}</p>}
            <Button onClick={() => onResume(r)} className="mt-2 h-8 w-full text-xs">
              Resume Diagnosis
            </Button>
          </li>
        ))}
      </ul>
      <Button onClick={onStartNew} variant="outline" className="mt-3 h-10 w-full text-xs">
        Start New Diagnosis
      </Button>
    </div>
  );
}
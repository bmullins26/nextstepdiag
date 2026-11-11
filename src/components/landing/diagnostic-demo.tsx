import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Check, Cpu, Gauge, Loader2, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_SCENARIOS, type DemoScenario } from "./demo-scenarios";

// Stages mirror the real Diagnose screen. Questions wait for the visitor to tap (auto-answers if idle).
type Stage = "plate" | "decode" | "diagram" | "q" | "result" | "parts";
const AUTO_MS = 4500;

export function DiagnosticDemo() {
  const [id, setId] = useState(DEMO_SCENARIOS[0].id);
  const [run, setRun] = useState(0);
  const s = DEMO_SCENARIOS.find((x) => x.id === id)!;
  const [stage, setStage] = useState<Stage>("plate");
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => { setStage("plate"); setQi(0); setAnswers([]); }, [id, run]);

  useEffect(() => {
    const next: Partial<Record<Stage, [Stage, number]>> = { plate: ["decode", 1400], decode: ["diagram", 1600], diagram: ["q", 1300], result: ["parts", 2200] };
    const n = next[stage];
    if (n) { const t = setTimeout(() => setStage(n[0]), n[1]); return () => clearTimeout(t); }
    if (stage === "q") { const t = setTimeout(() => answer(s.questions[qi].choices[s.questions[qi].pick]), AUTO_MS); return () => clearTimeout(t); }
  }, [stage, qi, s]);

  function answer(a: string) {
    setAnswers((p) => [...p, a]);
    if (qi + 1 < s.questions.length) setQi(qi + 1); else setStage("result");
  }

  const order: Stage[] = ["plate", "decode", "diagram", "q", "result", "parts"];
  const at = order.indexOf(stage);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/80 shadow-[0_0_60px_-20px] shadow-primary/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Try it · tap the answers</span>
        <button onClick={() => setRun((r) => r + 1)} className="flex min-h-9 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Restart
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3" role="tablist">
        {DEMO_SCENARIOS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === id} onClick={() => setId(x.id)}
            className={cn("min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold uppercase tracking-wider transition",
              x.id === id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <Plate s={s} />
        {at >= 1 && <Decode s={s} loading={stage === "decode"} />}
        {at >= 2 && <Card icon={BookOpen} title="Parts diagram">
          {stage === "diagram" ? <Working text="Loading this model's diagrams…" /> :
            <p className="text-xs">{s.diagramParts} real parts loaded for {s.model} — diagnosis only uses parts this unit actually has.</p>}
        </Card>}
        {at >= 3 && <Card icon={Cpu} title="Guided diagnosis · one question at a time">
          {answers.map((a, i) => (
            <div key={i} className="mb-2 text-xs"><span className="text-muted-foreground">{s.questions[i].q}</span><div className="font-semibold text-primary">→ {a}</div></div>
          ))}
          {stage === "q" && (
            <div>
              <p className="text-sm font-semibold">{s.questions[qi].q}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {s.questions[qi].choices.map((c) => (
                  <button key={c} onClick={() => answer(c)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary hover:bg-primary/10">{c}</button>
                ))}
              </div>
            </div>
          )}
        </Card>}
        {at >= 4 && <Result s={s} />}
        {at >= 5 && <Card icon={Wrench} title="Parts · checked against this model">
          {s.parts.map((p) => (
            <div key={p.number} className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-0 first:pt-0">
              <div className="min-w-0"><div className="truncate text-sm font-semibold">{p.name}</div><div className="font-mono text-xs text-muted-foreground">{p.number}</div></div>
              <div className="flex shrink-0 items-center gap-2"><span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Fits this model</span><span className="text-sm font-bold">{p.price}</span></div>
            </div>
          ))}
        </Card>}
        <p className="pt-1 text-center text-[10px] text-muted-foreground">Sample service calls. Your real calls use your model & serial.</p>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Check; title: string; children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-background/60 p-3 duration-500">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary"><Icon className="h-3.5 w-3.5" />{title}</div>
      {children}
    </div>
  );
}
const Working = ({ text }: { text: string }) => <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{text}</p>;

function Plate({ s }: { s: DemoScenario }) {
  return (
    <div className="rounded-xl border border-secondary/40 bg-secondary/10 p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-secondary">Data plate · {s.brand} {s.type}</div>
      <div className="mt-1 grid grid-cols-2 gap-2 font-mono text-sm">
        <div><span className="text-[10px] text-muted-foreground">MODEL</span><div className="font-bold">{s.model}</div></div>
        <div><span className="text-[10px] text-muted-foreground">SERIAL</span><div className="truncate font-bold">{s.serial}</div></div>
      </div>
      <div className="mt-2 text-sm">Complaint: <span className="font-semibold">"{s.complaint}"</span></div>
    </div>
  );
}

function Decode({ s, loading }: { s: DemoScenario; loading: boolean }) {
  return (
    <Card icon={ShieldCheck} title="Age & warranty">
      {loading ? <Working text="Decoding serial & checking warranty…" /> : (
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">Built {s.built}</span><span className="text-muted-foreground">· {s.age} old</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", s.warranty.good ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{s.warranty.status}</span>
          </div>
          <div className="text-muted-foreground">Source: {s.warranty.source}</div>
          {s.drive && <div className="font-semibold text-secondary">{s.drive}</div>}
        </div>
      )}
    </Card>
  );
}

function Result({ s }: { s: DemoScenario }) {
  return (
    <Card icon={Gauge} title="Your next step">
      <div className="space-y-1.5">
        {s.failures.map((f) => (
          <div key={f.name} className="text-xs">
            <div className="flex justify-between"><span className="font-semibold">{f.name}</span><span className="font-mono text-primary">{f.pct}%</span></div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${f.pct}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-2.5">
        <div className="text-sm font-bold">{s.nextTest}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{s.reading}</div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-secondary"><AlertTriangle className="h-3.5 w-3.5" />{s.safety}</div>
    </Card>
  );
}

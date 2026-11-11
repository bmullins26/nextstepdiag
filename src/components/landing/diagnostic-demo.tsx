import { useEffect, useState } from "react";
import { Check, Loader2, Phone, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_SCENARIOS } from "./demo-scenarios";

const STEP_MS = 1100;

/** Animated, self-running walkthrough of a NextStep diagnosis. Pure presentation — no backend calls. */
export function DiagnosticDemo() {
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id);
  const [progress, setProgress] = useState(0); // number of completed steps
  const [run, setRun] = useState(0);
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId)!;
  const total = scenario.steps.length;

  useEffect(() => {
    setProgress(0);
  }, [scenarioId, run]);

  useEffect(() => {
    if (progress >= total) return;
    const t = setTimeout(() => setProgress((p) => p + 1), progress === 0 ? 600 : STEP_MS);
    return () => clearTimeout(t);
  }, [progress, total, scenarioId, run]);

  const done = progress >= total;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/70 shadow-[0_0_60px_-20px] shadow-primary/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] text-muted-foreground">nextstep://field-diagnosis</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary">
          <span className={cn("h-2 w-2 rounded-full bg-primary", !done && "animate-pulse")} />
          {done ? "COMPLETE" : "LIVE"}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3" role="tablist">
        {DEMO_SCENARIOS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === scenarioId}
            onClick={() => setScenarioId(s.id)}
            className={cn(
              "min-h-9 shrink-0 rounded-full border px-4 text-xs font-bold uppercase tracking-wider transition",
              s.id === scenarioId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-secondary/30 bg-secondary/10 p-3">
          <Phone className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-secondary">Complaint</div>
            <div className="text-sm font-medium">"{scenario.complaint}"</div>
          </div>
        </div>

        <ol className="mt-4 space-y-2">
          {scenario.steps.map((step, i) => {
            const state = i < progress ? "done" : i === progress ? "active" : "pending";
            return (
              <li
                key={`${scenario.id}-${i}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500",
                  state === "done" && "border-primary/30 bg-primary/5",
                  state === "active" && "border-primary/60 bg-primary/10",
                  state === "pending" && "border-border opacity-50",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold",
                    state === "done" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="h-4 w-4" /> : state === "active" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : String(i + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{step.title}</div>
                  <div className={cn("font-mono text-[11px] sm:truncate", state === "done" ? "text-primary" : "text-muted-foreground")}>
                    {state === "done" ? step.result : state === "active" ? step.working : "Waiting…"}
                  </div>
                </div>
                {state === "done" && step.tag && (
                  <span className="hidden shrink-0 rounded border border-primary/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary sm:inline">
                    {step.tag}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex items-center justify-between">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${(progress / total) * 100}%` }} />
          </div>
          <button
            onClick={() => setRun((r) => r + 1)}
            className="ml-3 flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Replay
          </button>
        </div>
      </div>
    </div>
  );
}

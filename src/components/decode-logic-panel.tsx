import { useState } from "react";
import { Button } from "@/components/ui/button";

export type DecodeLogic = {
  status: "ok" | "unknown";
  ruleId: string | null;
  ruleName: string | null;
  steps: Array<{ label: string; value: string; detail?: string }>;
  validation: Array<{ label: string; passed: boolean; detail?: string }>;
  rejected: Array<{
    ruleId: string;
    year: number;
    month?: number | null;
    week?: number | null;
    reason: string;
    detail: string;
  }>;
  attemptedRules: Array<{ id: string; name: string; matched: boolean; reason?: string }>;
  confidenceBreakdown: {
    points: Array<{ label: string; points: number; awarded: boolean; detail?: string }>;
    earned: number;
    max: number;
    percent: number;
    label: string;
  } | null;
  communityConfirmations: number;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

/** Transparent, character-by-character derivation of the decoded age. */
export function DecodeLogicPanel({ logic }: { logic: DecodeLogic }) {
  const [open, setOpen] = useState(false);
  const cb = logic.confidenceBreakdown;

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide decode logic" : "Show decode logic"}
      </Button>

      {open ? (
        <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3 text-xs">
          <Section title="Rule used">
            <div className="font-medium">
              {logic.ruleName ?? "No rule matched"}
              {logic.ruleId ? (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{logic.ruleId}</span>
              ) : null}
            </div>
          </Section>

          {logic.steps.length ? (
            <Section title="Derivation">
              <ul className="space-y-1">
                {logic.steps.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <span className="min-w-[110px] text-muted-foreground">{s.label}</span>
                    <span className="font-mono">{s.value}</span>
                    {s.detail ? <span className="text-[10px] text-muted-foreground">{s.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {logic.validation.length ? (
            <Section title="Validation">
              <ul className="space-y-0.5">
                {logic.validation.map((v, i) => (
                  <li key={i} className={v.passed ? "text-emerald-300" : "text-amber-300"}>
                    {v.passed ? "✓" : "✕"} {v.label}
                    {v.detail ? <span className="ml-1 text-[10px] text-muted-foreground">{v.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {logic.rejected.length ? (
            <Section title={`Rejected candidates (${logic.rejected.length})`}>
              <ul className="space-y-0.5 text-muted-foreground">
                {logic.rejected.slice(0, 12).map((r, i) => (
                  <li key={i}>
                    <span className="font-mono">
                      {r.month ? `${r.month}/` : ""}
                      {r.year}
                    </span>{" "}
                    — {r.detail}{" "}
                    <span className="text-[10px] uppercase tracking-wide">({r.reason})</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {logic.attemptedRules.length ? (
            <Section title="Formats tried">
              <ul className="space-y-0.5 text-muted-foreground">
                {logic.attemptedRules.map((a) => (
                  <li key={a.id}>
                    {a.matched ? "✓" : "·"} {a.name}
                    {a.reason ? <span className="text-[10px]"> — {a.reason}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {cb ? (
            <Section title={`Confidence · ${cb.percent}% ${cb.label}`}>
              <ul className="space-y-0.5">
                {cb.points.map((p, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2">
                    <span className={p.awarded ? "" : "text-muted-foreground"}>
                      {p.label}
                      {p.detail ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">{p.detail}</span>
                      ) : null}
                    </span>
                    <span className={`shrink-0 font-mono ${p.points < 0 ? "text-amber-300" : ""}`}>
                      {p.points > 0 ? "+" : ""}
                      {p.points}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 border-t border-border/50 pt-1 text-right font-mono">
                {cb.earned} / {cb.max} → {cb.percent}%
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { recordInsightFeedback } from "@/lib/community.functions";
import type { EvidenceItem } from "@/lib/evidence/types";

export function InsightFeedbackButtons({
  item,
  sessionId,
}: {
  item: EvidenceItem;
  sessionId: string | null;
}) {
  const record = useServerFn(recordInsightFeedback);
  const [state, setState] = useState<"idle" | "helpful" | "not_helpful">("idle");
  const [busy, setBusy] = useState(false);

  const discussionId = item.id.split(":")[1];
  if (!discussionId) return null;

  async function fire(v: "helpful" | "not_helpful") {
    setBusy(true);
    try {
      await record({
        data: {
          sessionId: sessionId ?? null,
          discussionId,
          userResponse: v,
          insightSnapshot: {
            title: item.title,
            summary: item.summary,
            confidence: item.confidence,
            sourceType: item.sourceType,
            matchTier: (item.metadata as { matchTier?: string } | undefined)?.matchTier ?? null,
          },
        },
      });
      setState(v);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">Was this insight helpful?</span>
      <div className="flex gap-1.5">
        <button
          onClick={() => fire("helpful")}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
            state === "helpful"
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        ><ThumbsUp className="h-3 w-3" /> Yes</button>
        <button
          onClick={() => fire("not_helpful")}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
            state === "not_helpful"
              ? "border-destructive/50 bg-destructive/15 text-destructive"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        ><ThumbsDown className="h-3 w-3" /> No</button>
      </div>
    </div>
  );
}
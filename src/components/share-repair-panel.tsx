import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, MessagesSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getOutcomeDiscussion, shareOutcomeToCommunity } from "@/lib/confirmed-repairs.functions";

/**
 * Sharing is opt-in: the repair stays private until the technician taps share.
 * Only the fields below plus optional public notes ever become visible.
 */
export function ShareRepairPanel({
  outcomeId,
  brand,
  applianceType,
  model,
  complaint,
  confirmedFailure,
  partReplaced,
  confirmingTest,
  onOpenComposer,
}: {
  outcomeId: string;
  brand: string;
  applianceType: string;
  model: string;
  complaint: string;
  confirmedFailure: string;
  partReplaced: string | null;
  confirmingTest: string | null;
  onOpenComposer: (search: Record<string, string>) => void;
}) {
  const share = useServerFn(shareOutcomeToCommunity);
  const existing = useServerFn(getOutcomeDiscussion);
  const [busy, setBusy] = useState(false);
  const [publicNotes, setPublicNotes] = useState("");
  const [alreadyShared, setAlreadyShared] = useState<{ id: string } | null>(null);

  async function go() {
    setBusy(true);
    try {
      const prior = (await existing({ data: { outcomeId } })) as { id: string } | null;
      if (prior) {
        setAlreadyShared(prior);
        return;
      }
      await share({ data: { outcomeId, publicNotes: publicNotes.trim() || null } });
      onOpenComposer({
        brand,
        applianceType,
        model,
        complaint,
        confirmedFailure,
        discussionType: "confirmed_repair",
        verifiedOutcomeId: outcomeId,
        partReplaced: partReplaced ?? "",
        confirmingTest: confirmingTest ?? "",
        title: `${model} — ${confirmedFailure}`,
        body: [
          `Complaint: ${complaint}`,
          `Confirmed failure: ${confirmedFailure}`,
          partReplaced ? `Part replaced: ${partReplaced}` : "",
          confirmingTest ? `Confirming test: ${confirmingTest}` : "",
          publicNotes.trim() ? `\n${publicNotes.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (alreadyShared) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm">
        <p className="font-semibold">This repair is already shared with the Community.</p>
        <Link to="/community/$discussionId" params={{ discussionId: alreadyShared.id }}>
          <Button className="mt-3 h-10 w-full" variant="outline">Open the discussion</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Share this repair with the Community?
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Publishes brand, appliance type, model, complaint, confirmed failure, part and confirming test as a
        Verified Repair. Private notes and photos are never shared.
      </p>
      <Textarea
        value={publicNotes}
        onChange={(e) => setPublicNotes(e.target.value)}
        placeholder="Optional public notes…"
        className="mb-3 min-h-16"
      />
      <Button className="h-10 w-full" onClick={go} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessagesSquare className="mr-2 h-4 w-4" />}
        Share with community
      </Button>
    </div>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ThumbsUp, Sparkles, CheckCircle2, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleReaction } from "@/lib/community.functions";
import { toast } from "sonner";

type Reaction = "like" | "helpful" | "solved" | "not_helpful";

export function ReactionBar({
  targetType,
  targetId,
  counts,
  active,
  showNotHelpful = false,
  onChange,
}: {
  targetType: "discussion" | "reply";
  targetId: string;
  counts: Partial<Record<Reaction, number>>;
  active: Reaction[];
  showNotHelpful?: boolean;
  onChange?: () => void;
}) {
  const [busy, setBusy] = useState<Reaction | null>(null);
  const toggle = useServerFn(toggleReaction);

  async function fire(r: Reaction) {
    setBusy(r);
    try {
      await toggle({ data: { targetType, targetId, reaction: r } });
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const btn = (r: Reaction, label: string, Icon: typeof ThumbsUp) => {
    const on = active.includes(r);
    return (
      <Button
        key={r}
        type="button"
        size="sm"
        variant={on ? "default" : "outline"}
        className="h-8"
        disabled={busy === r}
        onClick={() => fire(r)}
      >
        <Icon className="mr-1 h-3.5 w-3.5" />
        {label}
        {counts[r] != null && <span className="ml-1.5 text-xs opacity-70">{counts[r]}</span>}
      </Button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {btn("like", "Like", ThumbsUp)}
      {btn("helpful", "Helpful", Sparkles)}
      {targetType === "reply" && btn("solved", "Solved", CheckCircle2)}
      {showNotHelpful && btn("not_helpful", "Not helpful", ThumbsDown)}
    </div>
  );
}
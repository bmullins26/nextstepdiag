import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReactionBar } from "./reaction-bar";
import {
  createReply,
  deleteReply,
  markSolved,
  updateReply,
} from "@/lib/community.functions";

export type Reply = {
  id: string;
  discussion_id: string;
  author_id: string;
  parent_reply_id: string | null;
  body: string;
  like_count: number;
  helpful_count: number;
  not_helpful_count: number;
  is_solved: boolean;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

export function ReplyThread({
  discussionId,
  replies,
  authors,
  myReactions,
  currentUserId,
  discussionAuthorId,
  isOwner,
  solvedReplyId,
  onRefresh,
}: {
  discussionId: string;
  replies: Reply[];
  authors: Record<string, { name: string }>;
  myReactions: Record<string, string[]>;
  currentUserId: string;
  discussionAuthorId: string;
  isOwner: boolean;
  solvedReplyId: string | null;
  onRefresh: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createReply);
  const remove = useServerFn(deleteReply);
  const solve = useServerFn(markSolved);
  const update = useServerFn(updateReply);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const sorted = [...replies].sort((a, b) => {
    if (a.id === solvedReplyId) return -1;
    if (b.id === solvedReplyId) return 1;
    const scoreA = (a.helpful_count || 0) - (a.not_helpful_count || 0);
    const scoreB = (b.helpful_count || 0) - (b.not_helpful_count || 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.created_at.localeCompare(b.created_at);
  });

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await create({ data: { discussionId, body } });
      setBody("");
      onRefresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const canModerate = (r: Reply) => r.author_id === currentUserId || isOwner;
  const canMarkSolved = discussionAuthorId === currentUserId || isOwner;

  return (
    <div className="space-y-3">
      {sorted.map((r) => {
        const isSolved = r.id === solvedReplyId;
        const isEditing = editing === r.id;
        const author = authors[r.author_id]?.name ?? "Technician";
        const rk = `reply:${r.id}`;
        return (
          <div
            key={r.id}
            className={`rounded-2xl border p-4 ${
              isSolved ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card/60"
            }`}
          >
            {isSolved && (
              <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Solution
              </div>
            )}
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">{author}</span>
              <span>{new Date(r.created_at).toLocaleString()}</span>
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="min-h-20" />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={async () => {
                      try {
                        await update({ data: { id: r.id, body: editBody } });
                        setEditing(null);
                        onRefresh();
                      } catch (e) { toast.error((e as Error).message); }
                    }}
                  >Save</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-foreground">{r.body}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ReactionBar
                targetType="reply"
                targetId={r.id}
                counts={{ like: r.like_count, helpful: r.helpful_count, not_helpful: r.not_helpful_count }}
                active={(myReactions[rk] ?? []) as ("like" | "helpful" | "solved" | "not_helpful")[]}
                showNotHelpful
                onChange={onRefresh}
              />
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {canMarkSolved && !isSolved && (
                  <button
                    onClick={async () => { await solve({ data: { discussionId, replyId: r.id } }); onRefresh(); }}
                    className="rounded-full border border-emerald-500/40 px-2 py-0.5 font-semibold text-emerald-300 hover:bg-emerald-500/10"
                  >Mark as solution</button>
                )}
                {canMarkSolved && isSolved && (
                  <button
                    onClick={async () => { await solve({ data: { discussionId, replyId: null } }); onRefresh(); }}
                    className="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground"
                  >Unmark</button>
                )}
                {canModerate(r) && !isEditing && (
                  <button
                    onClick={() => { setEditing(r.id); setEditBody(r.body); }}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground"
                  ><Pencil className="h-3 w-3" /> Edit</button>
                )}
                {canModerate(r) && (
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this reply?")) return;
                      await remove({ data: { id: r.id } });
                      onRefresh();
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2 py-0.5 text-destructive hover:bg-destructive/10"
                  ><Trash2 className="h-3 w-3" /> Delete</button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share what you found or what you'd check next…"
          className="min-h-24"
        />
        <Button onClick={post} disabled={busy || !body.trim()} className="h-10">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reply
        </Button>
      </div>
    </div>
  );
}
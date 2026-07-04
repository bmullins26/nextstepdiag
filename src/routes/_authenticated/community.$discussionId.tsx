import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDiscussion, deleteDiscussion } from "@/lib/community.functions";
import { DiscussionTypeBadge } from "@/components/community/discussion-type-badge";
import { ReactionBar } from "@/components/community/reaction-bar";
import { ReplyThread, type Reply } from "@/components/community/reply-thread";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/community/$discussionId")({
  head: () => ({ meta: [{ title: "Discussion — Community — NextStep" }] }),
  component: DiscussionPage,
});

function DiscussionPage() {
  const { discussionId } = Route.useParams();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getDiscussion);
  const remove = useServerFn(deleteDiscussion);

  const [userId, setUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user?.id) {
        supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "owner").maybeSingle()
          .then(({ data: r }) => setIsOwner(!!r));
      }
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["community", "discussion", discussionId],
    queryFn: () => get({ data: { id: discussionId } }),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  const d = data.discussion as {
    id: string; author_id: string; brand: string; appliance_type: string; model_number: string;
    complaint: string; error_code: string | null; confirmed_failure: string | null;
    discussion_type: string; title: string; body: string; verified_outcome_id: string | null;
    like_count: number; helpful_count: number; solved_reply_id: string | null;
    confirmed_success_count: number; success_rate: number | null;
    created_at: string; updated_at: string;
  };
  const my = (data.myReactions as Record<string, string[]>)[`discussion:${d.id}`] ?? [];
  const canDelete = userId === d.author_id || isOwner;
  const authorName = (data.authors as Record<string, { name: string }>)[d.author_id]?.name ?? "Technician";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-6">
        <Link to="/community" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Community
        </Link>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">{d.brand}</span>
                <span>·</span>
                <span>{d.appliance_type}</span>
                <span>·</span>
                <span className="font-mono">{d.model_number}</span>
                <DiscussionTypeBadge type={d.discussion_type} />
                {d.verified_outcome_id && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> Verified Repair
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold">{d.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Posted by <span className="font-semibold text-foreground/80">{authorName}</span> · {new Date(d.created_at).toLocaleString()}
              </p>
            </div>
            {canDelete && (
              <button
                onClick={async () => {
                  if (!confirm("Delete this discussion?")) return;
                  await remove({ data: { id: d.id } });
                  toast.success("Deleted.");
                  navigate({ to: "/community" });
                }}
                className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
          </div>

          <div className="mt-3 space-y-2 rounded-xl border border-border bg-background/40 p-3 text-sm">
            <div><span className="text-muted-foreground">Complaint:</span> {d.complaint}</div>
            {d.error_code && <div><span className="text-muted-foreground">Error code:</span> <span className="font-mono">{d.error_code}</span></div>}
            {d.confirmed_failure && <div><span className="text-muted-foreground">Confirmed cause:</span> <span className="font-semibold text-primary">{d.confirmed_failure}</span></div>}
          </div>

          {d.body && <div className="mt-3 whitespace-pre-wrap text-sm">{d.body}</div>}

          {d.verified_outcome_id && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              <div className="font-bold">Verified Repair</div>
              <div>
                Confirmed by {1 + (d.confirmed_success_count ?? 0)} technician{(1 + (d.confirmed_success_count ?? 0)) === 1 ? "" : "s"}
                {d.success_rate != null && <> · Success rate {Math.round((d.success_rate ?? 0) * 100)}%</>}
              </div>
            </div>
          )}

          <div className="mt-4">
            <ReactionBar
              targetType="discussion"
              targetId={d.id}
              counts={{ like: d.like_count, helpful: d.helpful_count }}
              active={my as ("like" | "helpful" | "solved" | "not_helpful")[]}
              onChange={() => qc.invalidateQueries({ queryKey: ["community", "discussion", discussionId] })}
            />
          </div>
        </div>

        <div className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Replies ({(data.replies as Reply[]).length})
          </h2>
          {userId && (
            <ReplyThread
              discussionId={d.id}
              replies={data.replies as Reply[]}
              authors={data.authors as Record<string, { name: string }>}
              myReactions={data.myReactions as Record<string, string[]>}
              currentUserId={userId}
              discussionAuthorId={d.author_id}
              isOwner={isOwner}
              solvedReplyId={d.solved_reply_id}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["community", "discussion", discussionId] })}
            />
          )}
        </div>
      </div>
    </main>
  );
}
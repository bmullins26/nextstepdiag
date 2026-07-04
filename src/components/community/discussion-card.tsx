import { Link } from "@tanstack/react-router";
import { MessageSquare, ThumbsUp, ShieldCheck, Eye } from "lucide-react";
import { DiscussionTypeBadge } from "./discussion-type-badge";

export type DiscussionSummary = {
  id: string;
  title: string;
  brand: string;
  appliance_type: string;
  model_number: string;
  complaint: string;
  discussion_type: string;
  helpful_count?: number | null;
  reply_count?: number | null;
  view_count?: number | null;
  verified_outcome_id?: string | null;
  confirmed_failure?: string | null;
  updated_at: string;
  created_at: string;
};

export function DiscussionCard({ d }: { d: DiscussionSummary }) {
  return (
    <Link
      to="/community/$discussionId"
      params={{ discussionId: d.id }}
      className="block rounded-2xl border border-border bg-card/60 p-4 transition hover:border-primary/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/80">{d.brand}</span>
            <span>·</span>
            <span>{d.appliance_type}</span>
            <span>·</span>
            <span className="font-mono">{d.model_number}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-bold text-foreground">{d.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/70">Complaint:</span> {d.complaint}
          </p>
          {d.confirmed_failure && (
            <p className="mt-0.5 line-clamp-1 text-xs text-primary">
              <span className="font-semibold">Confirmed cause:</span> {d.confirmed_failure}
            </p>
          )}
        </div>
        {d.verified_outcome_id && (
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Verified repair" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <DiscussionTypeBadge type={d.discussion_type} />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {d.helpful_count ?? 0}</span>
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {d.reply_count ?? 0}</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {d.view_count ?? 0}</span>
        </div>
      </div>
    </Link>
  );
}
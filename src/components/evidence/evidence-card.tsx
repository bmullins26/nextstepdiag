import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { EvidenceItem } from "@/lib/evidence/types";
import { SourceTypeBadge } from "./source-type-badge";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function EvidenceCard({
  item,
  children,
}: {
  item: EvidenceItem;
  children?: React.ReactNode;
}) {
  const conf = Math.round(item.confidence * 100);
  const isCommunity =
    item.sourceType === "community_discussion" || item.sourceType === "community_verified";
  const isInternal = item.link?.startsWith("/");

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <SourceTypeBadge sourceType={item.sourceType} />
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Last updated {timeAgo(item.lastUpdated)}</span>
        </div>
      </div>
      <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-14 shrink-0 text-muted-foreground">Confidence</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${conf}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{conf}%</span>
        </div>
        {(item.supportingDiscussionCount != null || item.supportingVerifiedRepairCount != null) && (
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {item.supportingDiscussionCount != null && (
              <span>{item.supportingDiscussionCount} supporting discussion{item.supportingDiscussionCount === 1 ? "" : "s"}</span>
            )}
            {item.supportingVerifiedRepairCount != null && item.supportingVerifiedRepairCount > 0 && (
              <span>{item.supportingVerifiedRepairCount} verified repair{item.supportingVerifiedRepairCount === 1 ? "" : "s"}</span>
            )}
          </div>
        )}
      </div>

      {item.link && (
        <div className="mt-3">
          {isInternal ? (
            <Link
              to={item.link}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {isCommunity ? "Open discussion" : "Open"} →
            </Link>
          ) : (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {children && <div className="mt-3 border-t border-border pt-3">{children}</div>}
    </div>
  );
}
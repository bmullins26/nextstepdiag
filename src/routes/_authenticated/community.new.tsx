import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { DiscussionComposer } from "@/components/community/discussion-composer";
import type { DiscussionType } from "@/lib/community/normalize";

const Schema = z.object({
  brand: z.string().optional().catch(undefined),
  applianceType: z.string().optional().catch(undefined),
  model: z.string().optional().catch(undefined),
  complaint: z.string().optional().catch(undefined),
  confirmedFailure: z.string().optional().catch(undefined),
  errorCode: z.string().optional().catch(undefined),
  discussionType: z.string().optional().catch(undefined),
  title: z.string().optional().catch(undefined),
  body: z.string().optional().catch(undefined),
  verifiedOutcomeId: z.string().uuid().optional().catch(undefined),
});


export const Route = createFileRoute("/_authenticated/community/new")({
  head: () => ({ meta: [{ title: "New discussion — Community — NextStep" }] }),
  validateSearch: (s: Record<string, unknown>) => Schema.parse(s),
  component: NewDiscussionPage,
});

function NewDiscussionPage() {
  const s = Route.useSearch();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        <Link to="/community" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Community
        </Link>
        <h1 className="mb-1 text-xl font-bold">New discussion</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Anchored to Brand → Appliance Type → Model → Complaint so it becomes searchable evidence for future diagnostics.
        </p>
        <DiscussionComposer
          prefill={{
            brand: s.brand,
            applianceType: s.applianceType,
            model: s.model,
            complaint: s.complaint,
            confirmedFailure: s.confirmedFailure,
            errorCode: s.errorCode,
            discussionType: (s.discussionType as DiscussionType | undefined) ?? undefined,
            title: s.title,
            body: s.body,
            verifiedOutcomeId: s.verifiedOutcomeId,
          }}
        />
      </div>
    </main>
  );
}
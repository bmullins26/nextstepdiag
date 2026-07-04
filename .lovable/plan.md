# NextStep Community — Phase 1 + Community Intelligence

Community as an evidence-anchored knowledge network. Every discussion is tied to Brand → Appliance Type → Model → Complaint, and every Community Insight flows into the diagnostic engine through the same interface used for manufacturer docs, tech sheets, verified outcomes, and service bulletins.

Access: any signed-in user reads and posts. Sidebar gains a `Community` item (MessagesSquare icon).

## 1. Unified Evidence Engine

New module `src/lib/evidence/` — a provider-based pipeline that replaces ad-hoc lookups inside `diagnostics.functions.ts`.

```ts
// src/lib/evidence/types.ts
export type EvidenceSourceType =
  | 'manufacturer_doc' | 'service_bulletin' | 'verified_repair'
  | 'community_verified' | 'community_discussion' | 'tech_sheet'
  | 'external_repair_guide';

export interface EvidenceItem {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  summary: string;                 // one-line takeaway
  detail?: string;                 // optional richer body for AI prompt
  confidence: number;              // 0..1, provider-normalized
  supportingDiscussionCount?: number;
  supportingVerifiedRepairCount?: number;
  lastUpdated: string;             // ISO
  link?: string;                   // in-app or external URL
  metadata?: Record<string, unknown>;
}

export interface EvidenceQuery {
  brand: string;
  applianceType: string;
  model: string;
  complaint: string;
  errorCode?: string | null;
  sessionId?: string | null;
}

export interface EvidenceProvider {
  sourceType: EvidenceSourceType;
  priority: number;                // lower = higher rank
  fetch(q: EvidenceQuery): Promise<EvidenceItem[]>;
}
```

Priority ranks (lower first):
1 `manufacturer_doc` · 2 `service_bulletin` · 3 `verified_repair` · 4 `community_verified` · 5 `community_discussion` · 6 `external_repair_guide` · `tech_sheet` slots at 1.5 (structured OEM data).

`src/lib/evidence/registry.ts` — registers providers. Initial concrete providers wrap existing code paths:
- `techSheetProvider` — wraps `tech-sheets/lookup.functions.ts`.
- `verifiedRepairProvider` — reads `diagnostic_outcomes` where `outcome='confirmed'` matching brand + family + complaint.
- `communityVerifiedProvider` and `communityDiscussionProvider` — see §3.
- Stubs `manufacturerDocProvider`, `serviceBulletinProvider`, `externalRepairGuideProvider` return `[]` today but exist so the registry order matches spec.

`src/lib/evidence/engine.ts` — `gatherEvidence(query)` calls every provider in parallel, tags each item with priority, and returns a single ranked `EvidenceItem[]` (sort: priority asc, then confidence desc, then lastUpdated desc). This ranked list is the sole input to the diagnostic prompt's evidence section — no more direct fetches inside `diagnostics.functions.ts`.

## 2. Evidence Priority in the AI Prompt

`src/lib/diagnostics.functions.ts` is updated so the system prompt now contains an explicit "Evidence hierarchy" block:

> Weight evidence in this exact order: Manufacturer Documentation > Service Bulletins > Verified Repair Outcomes > Community Verified Repairs > Community Discussions > External Repair Guides. Community evidence may strengthen a recommendation when it corroborates higher-tier sources, but must NEVER override manufacturer documentation or a verified repair outcome. When higher-tier evidence conflicts with community evidence, follow the higher tier and note the disagreement.

Evidence is injected into the prompt grouped by tier with counts, so the model sees exactly which tier each fact came from. The returned recommendation stores which `EvidenceItem.id`s it used → `diagnostic_sessions.evidence_used jsonb[]`.

## 3. Platform / Model Families

`src/lib/appliance/model-family.ts`
```ts
export function normalizeModel(m: string): string; // upper, strip whitespace/dashes
export function modelFamilyKey(brand: string, model: string): string; // e.g. WHIRLPOOL:WRF555SDF
export function candidateModels(brand: string, model: string): {
  exact: string;
  family: string;   // stem used for prefix match
  brandType: true;  // signals fallback
};
```

Family stem = brand-specific rule (reuses logic in `src/lib/tech-sheets/platform-families.ts` when a match exists) + generic fallback that trims trailing variant suffixes (last 1–3 alnum characters — configurable). Example: `WRF555SDFZ | WRF555SDFW | WRF555SDHV | WRF555SDFM` all resolve to family stem `WRF555SD`.

Community search & the diagnostic engine both search four tiers and merge results, tagging each hit:
- `match_tier: 'exact' | 'family' | 'brand_type' | 'brand'` — used for evidence `confidence` weighting (exact=1.0, family=0.75, brand_type=0.5, brand=0.3 base, then adjusted by success rate — see §4).

## 4. Community Learning Loop

New table `community_insight_feedback`:
- `id`, `session_id` fk `diagnostic_sessions`, `discussion_id` fk `community_discussions`, `insight_snapshot jsonb` (title, summary, match_tier, confidence at time-of-use), `user_response` (`helpful | not_helpful | null`), `final_outcome` (`confirmed | incorrect | partial | pending | null`), `created_at`, `updated_at`.

Flow:
1. When `gatherEvidence` returns community items and the AI cites them, the diagnose page renders each Community Insight with a thumbs up/down control. Clicking it inserts/updates a `community_insight_feedback` row keyed on `(session_id, discussion_id)`.
2. When the user later confirms/rejects the diagnosis via `outcome-capture.tsx`, the outcome is stitched into the same feedback row (`final_outcome`).
3. `community_discussions` gains derived columns updated by trigger:
   - `confirmed_success_count int` — feedback rows where `final_outcome='confirmed'`
   - `confirmed_failure_count int` — where `final_outcome='incorrect'`
   - `success_rate float` — `confirmed / (confirmed + failure)` when denom ≥ 3, else null
4. `communityDiscussionProvider.fetch` computes confidence as:
   ```
   base = 0.4 * matchTierWeight
   successAdj = success_rate != null ? (success_rate - 0.5) * 0.5 : 0
   popularityAdj = clamp(helpful_count / 20, 0, 0.1)   // capped so popularity never dominates
   confidence = clamp(base + successAdj + popularityAdj, 0.05, 0.95)
   ```
   Popularity contribution is capped at 0.1; confirmed-success-rate contribution is up to ±0.25. Discussions with repeated failed outcomes fall below the display threshold (0.2) and are filtered out.

## 5. Evidence Card + Source Attribution

Shared component `src/components/evidence/evidence-card.tsx` renders any `EvidenceItem`. Header = source type badge (color per tier) + title. Body = `summary`. Footer row shows:
- Source (e.g. `Community · Discussion`)
- Supporting: `N discussions · M verified repairs` (when applicable)
- Last updated (relative)
- Confidence bar (0–100%)
- Link → in-app discussion route (community items) or external URL (docs/guides)

`evidence-list.tsx` groups cards by tier with a divider label ("Manufacturer", "Service Bulletins", "Verified Repairs", "Community — Verified", "Community — Discussions", "External Guides"). Used on the diagnose result screen — no evidence is rendered anywhere else without going through this component, so attribution is guaranteed.

## 6. Community core (Phase 1 baseline)

Routes under `src/routes/_authenticated/`: `community.tsx` (home), `community.browse.tsx`, `community.search.tsx`, `community.new.tsx`, `community.$discussionId.tsx`.

Home sections: Recent Discussions, Popular Repairs (by `helpful_count`), Recently Confirmed Repairs (linked to confirmed outcomes), Most Active Contributors (last 30d), Trending Models (last 14d), Newest Uploads, search bar.

Strict composer (`community/discussion-composer.tsx`): Brand → Type → Model → Complaint all required. Model must exist in `diagnostic_sessions` OR user confirms "exact model" (uppercased, stored as-typed). Discussion type badge required: `general | repair_tip | question | confirmed_repair | diagnostic_advice | part_recommendation | installation_tip | tech_sheet | service_bulletin`.

Replies: threaded one level. Reactions: `like | helpful | solved | not_helpful`. Sort by `helpful - not_helpful` desc; `solved` reply pins to top. Only the discussion author or an owner marks `solved`.

Verified Repair badge: set only when `verified_outcome_id` references a `diagnostic_outcomes` row owned by the author with `outcome='confirmed'`.

Auto-create from confirmed outcome: `outcome-capture.tsx` appends a "Share this repair with the community?" prompt after a `confirmed` submission → navigates to `/community/new` with pre-filled state.

## Database (single migration)

- `community_discussions` — id, author_id, brand, appliance_type, model_number, `family_key` (generated stored via `modelFamilyKey`), complaint (normalized), error_code, confirmed_failure, discussion_type, title, body, verified_outcome_id fk, view_count, reply_count, like_count, helpful_count, solved_reply_id, tags text[], `confirmed_success_count int default 0`, `confirmed_failure_count int default 0`, `success_rate float`, created_at, updated_at.
- `community_replies` — id, discussion_id fk, author_id, parent_reply_id, body, like_count, helpful_count, not_helpful_count, is_solved, created_at, updated_at, edited_at.
- `community_reactions` — id, user_id, target_type ('discussion'|'reply'), target_id, reaction. Unique(user_id, target_type, target_id, reaction).
- `community_attachments` — id, discussion_id / reply_id, storage_path, mime, size, created_at. Public bucket `community-attachments`.
- `community_insight_feedback` — as in §4.
- `diagnostic_sessions` — add `evidence_used jsonb default '[]'::jsonb`.

Indexes on `(brand, appliance_type, model_number)`, `(brand, family_key)`, `(model_number, complaint)`, `discussion_id`, `(target_type, target_id)`, GIN on `tags`. Triggers keep denorm counters and `success_rate` current. RLS: SELECT to `authenticated` on all community tables; INSERT/UPDATE/DELETE scoped to `auth.uid()`; owners can moderate any row.

## Server functions (`src/lib/community.functions.ts`, all `requireSupabaseAuth`)

`listCommunityHome`, `searchKnownModels`, `listComplaintsForModel`, `browseCommunity`, `searchCommunity`, `getDiscussion`, `createDiscussion`, `updateDiscussion`, `deleteDiscussion`, `createReply`, `updateReply`, `deleteReply`, `toggleReaction`, `markSolved`, `recordInsightFeedback({ sessionId, discussionId, insightSnapshot, userResponse })`.

`src/lib/evidence/evidence.functions.ts`: `gatherEvidenceForSession({ sessionId })` — used by `diagnose.tsx` to render the evidence list.

## Files touched

**New**
- Migration `supabase/migrations/<ts>_community_evidence.sql`
- `src/lib/evidence/types.ts`, `registry.ts`, `engine.ts`, `evidence.functions.ts`
- `src/lib/evidence/providers/{tech-sheet,verified-repair,community-verified,community-discussion,manufacturer-doc,service-bulletin,external-repair-guide}.ts`
- `src/lib/community.functions.ts`, `src/lib/community/normalize.ts`
- `src/lib/appliance/model-family.ts`
- `src/components/evidence/evidence-card.tsx`, `evidence-list.tsx`, `source-type-badge.tsx`
- `src/components/community/{discussion-composer,discussion-card,discussion-type-badge,reply-thread,reaction-bar,model-picker,insight-feedback-buttons}.tsx`
- Routes: `community.tsx`, `community.browse.tsx`, `community.search.tsx`, `community.new.tsx`, `community.$discussionId.tsx`

**Edited**
- `src/components/app-sidebar.tsx` — add Community nav
- `src/components/outcome-capture.tsx` — post-confirm share prompt + backfill `final_outcome` on any `community_insight_feedback` rows for this session
- `src/lib/diagnostics.functions.ts` — call `gatherEvidence`, inject tiered evidence block into prompt with explicit hierarchy rule, persist `evidence_used`
- `src/routes/_authenticated/diagnose.tsx` — render `<EvidenceList>` (grouped by tier) and thumbs feedback on each Community Insight

## Explicitly deferred (follow-up phase)

Reputation scores, badge tiers, moderator tools (pin/lock/merge/feature/mark-official/suspend), owner analytics dashboard, @mentions, video/code-snippet attachments, and the concrete implementations of `manufacturerDocProvider` / `serviceBulletinProvider` / `externalRepairGuideProvider` (registered but empty for now so the pipeline is ready when data arrives).

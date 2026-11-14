-- 1) Explicit review state on facts
ALTER TABLE public.knowledge_facts
  ADD COLUMN review_status text NOT NULL DEFAULT 'unreviewed'
  CHECK (review_status IN ('unreviewed','approved','rejected','quarantined'));

-- Derive from current final state (reviewKnowledgeFact: approve => needs_review=false + reviewed_by;
-- reject => needs_review=true + reviewed_by + superseded_by=self)
UPDATE public.knowledge_facts SET review_status = CASE
  WHEN reviewed_by IS NOT NULL AND needs_review = false AND superseded_by IS NULL THEN 'approved'
  WHEN reviewed_by IS NOT NULL THEN 'rejected'
  ELSE 'unreviewed' END;

-- 1b) VerifiedApplianceData (Brian, 2026-11-13: buying-guide site, not repair evidence).
--     KEEP the 64 facts Brian approved in August (reviewed_by NOT NULL) and their 48 chunks.
--     QUARANTINE only the 105 never-reviewed facts and their 87 chunks. Archive, don't delete:
--     prior state goes to knowledge_quarantine_log so it is reversible (undo in §A5).
--     The 6 sources are blocked from receiving NEW content (importer stays disconnected).
ALTER TABLE public.knowledge_sources
  ADD COLUMN ingest_blocked_at timestamptz,
  ADD COLUMN ingest_blocked_reason text;
CREATE TABLE public.knowledge_quarantine_log (
  id bigserial PRIMARY KEY,
  fact_id uuid NOT NULL, source_id uuid NOT NULL,
  prior_authority knowledge_source_authority NOT NULL,
  prior_review_status text NOT NULL, prior_needs_review boolean NOT NULL,
  prior_reviewed_by uuid, prior_reviewed_at timestamptz,
  reason text NOT NULL, quarantined_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz);
ALTER TABLE public.knowledge_quarantine_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_quarantine_log FROM anon, authenticated;

UPDATE public.knowledge_sources
   SET ingest_blocked_at = now(),
       ingest_blocked_reason = 'VAD: consumer buying-guide site; no new content (Brian, 2026-11-13)'
 WHERE source_type = 'external_repair_data' AND source_url ILIKE '%verifiedappliancedata%';   -- expect 6

INSERT INTO public.knowledge_quarantine_log
  (fact_id, source_id, prior_authority, prior_review_status, prior_needs_review,
   prior_reviewed_by, prior_reviewed_at, reason)
SELECT f.id, f.source_id, f.source_authority, f.review_status, f.needs_review,
       f.reviewed_by, f.reviewed_at, 'VAD unreviewed fact: buying-guide content, not repair evidence'
  FROM public.knowledge_facts f JOIN public.knowledge_sources s ON s.id = f.source_id
 WHERE s.ingest_blocked_at IS NOT NULL AND f.reviewed_by IS NULL;                          -- expect 105

UPDATE public.knowledge_facts f
   SET review_status = 'quarantined', needs_review = true,
       source_authority = 'ai_extracted_pending_review'
  FROM public.knowledge_sources s
 WHERE s.id = f.source_id AND s.ingest_blocked_at IS NOT NULL AND f.reviewed_by IS NULL;   -- expect 105
-- The 64 reviewed VAD facts were already classed 'approved' by step 1 and are untouched.

-- 2) Re-queue every AI-origin fact that is live without approval (expect 37 rows: 31 unreviewed = 22 Kenmore + 9 repair_record,
--    plus 6 'rejected' (reviewed then self-superseded) rows that still have needs_review=false and would
--    otherwise violate step 7; the 105 unreviewed VAD facts were already quarantined by 1b)
UPDATE public.knowledge_facts SET needs_review = true
 WHERE origin <> 'human' AND review_status <> 'approved' AND needs_review = false;

-- 3) Strip unearned authority from any remaining unapproved AI rows (expect 0 after 1b; kept as a safety net)
UPDATE public.knowledge_facts SET source_authority = 'ai_extracted_pending_review'
 WHERE origin <> 'human' AND review_status <> 'approved'
   AND source_authority IN ('external_verified_source','reviewed_normalized');

-- 4) Provenance + review columns on chunks (chunks currently lack origin_actor/reviewed_by)
ALTER TABLE public.knowledge_chunks
  ADD COLUMN origin_actor text,
  ADD COLUMN review_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','approved','rejected','quarantined')),
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz;

UPDATE public.knowledge_chunks c
   SET origin_actor = f.origin_actor, review_status = f.review_status,
       reviewed_by = f.reviewed_by, reviewed_at = f.reviewed_at,
       needs_review = f.needs_review, source_authority = f.source_authority, origin = f.origin
  FROM public.knowledge_facts f WHERE f.id = c.fact_id;

-- every chunk must trace to a fact (verified: 0 chunks have NULL fact_id today)
ALTER TABLE public.knowledge_chunks ALTER COLUMN fact_id SET NOT NULL;

-- 5) Replace the authority ceilings (facts + chunks)
ALTER TABLE public.knowledge_facts  DROP CONSTRAINT knowledge_facts_ai_authority_ceiling;
ALTER TABLE public.knowledge_chunks DROP CONSTRAINT knowledge_chunks_ai_authority_ceiling;
ALTER TABLE public.knowledge_facts ADD CONSTRAINT knowledge_facts_ai_authority_ceiling CHECK (
  origin = 'human'
  OR source_authority IN ('ai_extracted_pending_review','ai_inference')
  OR (source_authority = 'reviewed_normalized' AND review_status = 'approved'));
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_ai_authority_ceiling CHECK (
  origin = 'human'
  OR source_authority IN ('ai_extracted_pending_review','ai_inference')
  OR (source_authority = 'reviewed_normalized' AND review_status = 'approved'));

-- 6) reviewed_normalized requires an actual reviewer + timestamp
ALTER TABLE public.knowledge_facts ADD CONSTRAINT knowledge_facts_reviewed_requires_reviewer CHECK (
  source_authority <> 'reviewed_normalized'
  OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_status = 'approved'));
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_reviewed_requires_reviewer CHECK (
  source_authority <> 'reviewed_normalized'
  OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_status = 'approved'));

-- 7) No AI row is live unless approved (kills confidence-only auto-clear at the DB level)
ALTER TABLE public.knowledge_facts ADD CONSTRAINT knowledge_facts_ai_live_requires_approval CHECK (
  origin = 'human' OR needs_review = true OR review_status = 'approved');
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_ai_live_requires_approval CHECK (
  origin = 'human' OR needs_review = true OR review_status = 'approved');

-- 8) AI rows must name their model and job (verified: 0 violations today on facts)
ALTER TABLE public.knowledge_facts ADD CONSTRAINT knowledge_facts_ai_provenance_required CHECK (
  origin = 'human' OR (origin_actor IS NOT NULL AND job_id IS NOT NULL));
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_ai_provenance_required CHECK (
  origin = 'human' OR (origin_actor IS NOT NULL AND job_id IS NOT NULL));

-- 9) external_verified_source is retired for facts/chunks entirely
ALTER TABLE public.knowledge_facts  ADD CONSTRAINT knowledge_facts_no_external_verified
  CHECK (source_authority <> 'external_verified_source');
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_no_external_verified
  CHECK (source_authority <> 'external_verified_source');

-- 9b) Sources: external_verified_source survives only on ingest-blocked (legacy VAD) sources
ALTER TABLE public.knowledge_sources ADD CONSTRAINT knowledge_sources_no_live_external_verified
  CHECK (source_authority <> 'external_verified_source' OR ingest_blocked_at IS NOT NULL);

-- 10) Approval must come from an owner (DB-checked, not just app-checked);
--     NEW facts on an ingest-blocked source are forced into quarantine (existing approved facts are untouched);
--     leaving quarantine is service-role only
CREATE OR REPLACE FUNCTION public.knowledge_fact_review_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.knowledge_sources
                                    WHERE id = NEW.source_id AND ingest_blocked_at IS NOT NULL) THEN
    NEW.review_status := 'quarantined'; NEW.needs_review := true;
    NEW.source_authority := 'ai_extracted_pending_review';
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.review_status = 'quarantined' AND NEW.review_status <> 'quarantined'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'knowledge_unquarantine_requires_service_role';
  END IF;
  IF NEW.review_status = 'approved' AND (TG_OP = 'INSERT' OR OLD.review_status IS DISTINCT FROM 'approved') THEN
    IF NEW.reviewed_by IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.user_roles WHERE user_id = NEW.reviewed_by AND role = 'owner') THEN
      RAISE EXCEPTION 'knowledge_review_requires_owner_reviewer';
    END IF;
    IF NEW.reviewed_at IS NULL THEN NEW.reviewed_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_facts_review_guard
  BEFORE INSERT OR UPDATE OF review_status, reviewed_by, needs_review, source_authority ON public.knowledge_facts
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_fact_review_guard();

-- 11) Chunks always mirror their fact's review/authority state
CREATE OR REPLACE FUNCTION public.knowledge_chunk_inherit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.knowledge_facts%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.knowledge_facts WHERE id = NEW.fact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'knowledge_chunk_requires_fact'; END IF;
  NEW.origin := f.origin; NEW.origin_actor := f.origin_actor;
  NEW.source_authority := f.source_authority; NEW.needs_review := f.needs_review;
  NEW.review_status := f.review_status; NEW.reviewed_by := f.reviewed_by; NEW.reviewed_at := f.reviewed_at;
  NEW.job_id := COALESCE(NEW.job_id, f.job_id);
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_chunks_inherit BEFORE INSERT OR UPDATE ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_chunk_inherit();

CREATE OR REPLACE FUNCTION public.knowledge_fact_sync_chunks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.knowledge_chunks SET fact_id = fact_id WHERE fact_id = NEW.id; -- fires inherit trigger
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_facts_sync_chunks
  AFTER UPDATE OF needs_review, source_authority, review_status, reviewed_by, reviewed_at, origin_actor
  ON public.knowledge_facts FOR EACH ROW EXECUTE FUNCTION public.knowledge_fact_sync_chunks();
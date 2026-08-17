CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE public.knowledge_source_type AS ENUM (
  'service_manual','tech_sheet','wiring_diagram','error_code_doc','parts_doc',
  'technician_note','repair_record','service_call','community_thread','other'
);

CREATE TYPE public.knowledge_source_authority AS ENUM (
  'manufacturer_verified','technician_verified_repair','technician_entered',
  'reviewed_normalized','ai_extracted_pending_review','ai_inference'
);

CREATE TYPE public.knowledge_job_status AS ENUM (
  'pending','processing','completed','failed','needs_review'
);

CREATE TYPE public.knowledge_origin AS ENUM ('human','ai_extraction','ai_inference');

CREATE OR REPLACE FUNCTION public.knowledge_authority_weight(_a public.knowledge_source_authority)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _a
    WHEN 'manufacturer_verified' THEN 1.00
    WHEN 'technician_verified_repair' THEN 0.90
    WHEN 'technician_entered' THEN 0.75
    WHEN 'reviewed_normalized' THEN 0.60
    WHEN 'ai_extracted_pending_review' THEN 0.30
    WHEN 'ai_inference' THEN 0.15
  END;
$$;

-- 1. SOURCES ---------------------------------------------------------------
CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type public.knowledge_source_type NOT NULL,
  source_authority public.knowledge_source_authority NOT NULL DEFAULT 'ai_extracted_pending_review',
  title text NOT NULL DEFAULT '',
  manufacturer text,
  brand text,
  appliance_type text,
  model_number text,
  model_family text,
  source_url text,
  storage_path text,
  mime_type text,
  file_size bigint,
  content_hash text,
  ref_table text,
  ref_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_sources_has_origin CHECK (
    storage_path IS NOT NULL OR source_url IS NOT NULL OR (ref_table IS NOT NULL AND ref_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX knowledge_sources_hash_key ON public.knowledge_sources (content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX knowledge_sources_ref_key ON public.knowledge_sources (ref_table, ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX knowledge_sources_brand_model_idx ON public.knowledge_sources (lower(brand), lower(model_number));
CREATE INDEX knowledge_sources_uploader_idx ON public.knowledge_sources (uploaded_by);

GRANT SELECT ON public.knowledge_sources TO authenticated;
GRANT ALL ON public.knowledge_sources TO service_role;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Uploaders and owners read sources" ON public.knowledge_sources
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'owner'));

-- 2. PROCESSING JOBS -------------------------------------------------------
CREATE TABLE public.knowledge_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  status public.knowledge_job_status NOT NULL DEFAULT 'pending',
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  processing_error text,
  extraction_method text,
  extraction_confidence numeric,
  embedding_model text,
  attempt_count integer NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_jobs_source_idx ON public.knowledge_processing_jobs (source_id, created_at DESC);
CREATE INDEX knowledge_jobs_status_idx ON public.knowledge_processing_jobs (status);

GRANT SELECT ON public.knowledge_processing_jobs TO authenticated;
GRANT ALL ON public.knowledge_processing_jobs TO service_role;
ALTER TABLE public.knowledge_processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Uploaders and owners read jobs" ON public.knowledge_processing_jobs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM public.knowledge_sources s WHERE s.id = source_id AND s.uploaded_by = auth.uid())
  );

-- 3. EXTRACTIONS (append-only) --------------------------------------------
CREATE TABLE public.knowledge_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.knowledge_processing_jobs(id) ON DELETE SET NULL,
  page_number integer,
  section text,
  heading text,
  text text NOT NULL DEFAULT '',
  tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ocr_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_extractions_source_idx ON public.knowledge_extractions (source_id, page_number);

GRANT SELECT ON public.knowledge_extractions TO authenticated;
GRANT SELECT, INSERT ON public.knowledge_extractions TO service_role;
ALTER TABLE public.knowledge_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Uploaders and owners read extractions" ON public.knowledge_extractions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM public.knowledge_sources s WHERE s.id = source_id AND s.uploaded_by = auth.uid())
  );

-- 4. NORMALIZED FACTS ------------------------------------------------------
CREATE TABLE public.knowledge_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  extraction_id uuid REFERENCES public.knowledge_extractions(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.knowledge_processing_jobs(id) ON DELETE SET NULL,
  manufacturer text,
  brand text,
  appliance_type text,
  model_number text,
  model_family text,
  symptom text,
  complaint text,
  component text,
  part text,
  part_number text,
  test text,
  test_condition text,
  expected_result text,
  actual_result text,
  failure text,
  repair text,
  resolution text,
  error_code text,
  diagnostic_step text,
  notes text,
  source_authority public.knowledge_source_authority NOT NULL,
  origin public.knowledge_origin NOT NULL,
  origin_actor text,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_reason text,
  needs_review boolean NOT NULL DEFAULT true,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  superseded_by uuid REFERENCES public.knowledge_facts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_facts_ai_authority_ceiling CHECK (
    origin = 'human'
    OR source_authority IN ('reviewed_normalized','ai_extracted_pending_review','ai_inference')
  )
);
CREATE INDEX knowledge_facts_source_idx ON public.knowledge_facts (source_id);
CREATE INDEX knowledge_facts_lookup_idx ON public.knowledge_facts (lower(brand), lower(appliance_type), lower(model_family));
CREATE INDEX knowledge_facts_error_code_idx ON public.knowledge_facts (lower(error_code)) WHERE error_code IS NOT NULL;
CREATE INDEX knowledge_facts_review_idx ON public.knowledge_facts (needs_review, created_at DESC);
CREATE INDEX knowledge_facts_symptom_trgm ON public.knowledge_facts USING gin (symptom gin_trgm_ops);
CREATE INDEX knowledge_facts_failure_trgm ON public.knowledge_facts USING gin (failure gin_trgm_ops);

GRANT SELECT ON public.knowledge_facts TO authenticated;
GRANT ALL ON public.knowledge_facts TO service_role;
ALTER TABLE public.knowledge_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read all facts" ON public.knowledge_facts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Signed in users read cleared facts" ON public.knowledge_facts
  FOR SELECT TO authenticated
  USING (needs_review = false AND superseded_by IS NULL);

-- 5. CHUNKS ----------------------------------------------------------------
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  extraction_id uuid REFERENCES public.knowledge_extractions(id) ON DELETE SET NULL,
  fact_id uuid REFERENCES public.knowledge_facts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.knowledge_processing_jobs(id) ON DELETE SET NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  embedding vector(3072),
  embedding_model text,
  embedding_dims integer,
  token_count integer,
  brand text,
  manufacturer text,
  appliance_type text,
  model_number text,
  model_family text,
  component text,
  error_code text,
  symptom_tags text[] NOT NULL DEFAULT '{}',
  source_type public.knowledge_source_type NOT NULL,
  source_authority public.knowledge_source_authority NOT NULL,
  origin public.knowledge_origin NOT NULL,
  confidence_score numeric NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  needs_review boolean NOT NULL DEFAULT true,
  page_number integer,
  section text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_chunks_ai_authority_ceiling CHECK (
    origin = 'human'
    OR source_authority IN ('reviewed_normalized','ai_extracted_pending_review','ai_inference')
  )
);
CREATE INDEX knowledge_chunks_embedding_idx
  ON public.knowledge_chunks USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
CREATE INDEX knowledge_chunks_filter_idx
  ON public.knowledge_chunks (lower(brand), lower(appliance_type), lower(model_family));
CREATE INDEX knowledge_chunks_source_idx ON public.knowledge_chunks (source_id);
CREATE INDEX knowledge_chunks_content_trgm ON public.knowledge_chunks USING gin (content gin_trgm_ops);

GRANT SELECT ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read all chunks" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Signed in users read cleared chunks" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (needs_review = false);

-- 6. REVIEW LOG ------------------------------------------------------------
CREATE TABLE public.knowledge_review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id uuid REFERENCES public.knowledge_facts(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved','rejected','edited','authority_changed')),
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_review_log_fact_idx ON public.knowledge_review_log (fact_id, created_at DESC);

GRANT SELECT ON public.knowledge_review_log TO authenticated;
GRANT ALL ON public.knowledge_review_log TO service_role;
ALTER TABLE public.knowledge_review_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read review log" ON public.knowledge_review_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- updated_at triggers
CREATE TRIGGER knowledge_sources_updated_at BEFORE UPDATE ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER knowledge_jobs_updated_at BEFORE UPDATE ON public.knowledge_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER knowledge_facts_updated_at BEFORE UPDATE ON public.knowledge_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. HYBRID SEARCH ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(3072),
  query_text text DEFAULT NULL,
  filter_brand text DEFAULT NULL,
  filter_appliance_type text DEFAULT NULL,
  filter_model_family text DEFAULT NULL,
  filter_error_code text DEFAULT NULL,
  filter_component text DEFAULT NULL,
  filter_source_type public.knowledge_source_type DEFAULT NULL,
  min_authority_weight numeric DEFAULT 0,
  include_pending boolean DEFAULT false,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  fact_id uuid,
  extraction_id uuid,
  content text,
  brand text,
  appliance_type text,
  model_family text,
  component text,
  error_code text,
  page_number integer,
  section text,
  source_type public.knowledge_source_type,
  source_authority public.knowledge_source_authority,
  origin public.knowledge_origin,
  confidence_score numeric,
  needs_review boolean,
  similarity double precision,
  score double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id, c.source_id, c.fact_id, c.extraction_id, c.content, c.brand, c.appliance_type,
    c.model_family, c.component, c.error_code, c.page_number, c.section,
    c.source_type, c.source_authority, c.origin, c.confidence_score, c.needs_review,
    (1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::double precision AS similarity,
    (
      (1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))
      * public.knowledge_authority_weight(c.source_authority)
      * greatest(c.confidence_score, 0.1)
      + CASE WHEN query_text IS NOT NULL AND c.content ILIKE '%' || query_text || '%' THEN 0.05 ELSE 0 END
    )::double precision AS score
  FROM public.knowledge_chunks c
  WHERE c.embedding IS NOT NULL
    AND (include_pending OR c.needs_review = false)
    AND (filter_brand IS NULL OR lower(c.brand) = lower(filter_brand))
    AND (filter_appliance_type IS NULL OR lower(c.appliance_type) = lower(filter_appliance_type))
    AND (filter_model_family IS NULL OR lower(c.model_family) = lower(filter_model_family))
    AND (filter_error_code IS NULL OR lower(c.error_code) = lower(filter_error_code))
    AND (filter_component IS NULL OR lower(c.component) = lower(filter_component))
    AND (filter_source_type IS NULL OR c.source_type = filter_source_type)
    AND public.knowledge_authority_weight(c.source_authority) >= min_authority_weight
  ORDER BY score DESC
  LIMIT greatest(match_count, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, text, text, text, text, text, text, public.knowledge_source_type, numeric, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, text, text, text, text, text, text, public.knowledge_source_type, numeric, boolean, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.knowledge_authority_weight(public.knowledge_source_authority) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_authority_weight(public.knowledge_source_authority) TO authenticated, service_role;
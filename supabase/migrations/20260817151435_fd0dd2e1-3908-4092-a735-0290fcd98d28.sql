CREATE OR REPLACE FUNCTION public.knowledge_authority_weight(_a knowledge_source_authority)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _a
    WHEN 'manufacturer_verified' THEN 1.00
    WHEN 'technician_verified_repair' THEN 0.90
    WHEN 'technician_entered' THEN 0.75
    WHEN 'reviewed_normalized' THEN 0.60
    WHEN 'external_verified_source' THEN 0.50
    WHEN 'ai_extracted_pending_review' THEN 0.30
    WHEN 'ai_inference' THEN 0.15
  END;
$function$;

ALTER TABLE public.knowledge_facts DROP CONSTRAINT IF EXISTS knowledge_facts_ai_authority_ceiling;
ALTER TABLE public.knowledge_facts ADD CONSTRAINT knowledge_facts_ai_authority_ceiling
  CHECK (origin = 'human'::knowledge_origin OR source_authority = ANY (ARRAY[
    'reviewed_normalized'::knowledge_source_authority,
    'external_verified_source'::knowledge_source_authority,
    'ai_extracted_pending_review'::knowledge_source_authority,
    'ai_inference'::knowledge_source_authority]));

ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_ai_authority_ceiling;
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_ai_authority_ceiling
  CHECK (origin = 'human'::knowledge_origin OR source_authority = ANY (ARRAY[
    'reviewed_normalized'::knowledge_source_authority,
    'external_verified_source'::knowledge_source_authority,
    'ai_extracted_pending_review'::knowledge_source_authority,
    'ai_inference'::knowledge_source_authority]));
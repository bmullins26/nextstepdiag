DROP FUNCTION public.match_knowledge_chunks(vector,text,text,text,text,text,text,knowledge_source_type,numeric,boolean,integer);
CREATE FUNCTION public.match_knowledge_chunks(query_embedding vector, query_text text DEFAULT NULL::text, filter_brand text DEFAULT NULL::text, filter_appliance_type text DEFAULT NULL::text, filter_model_family text DEFAULT NULL::text, filter_error_code text DEFAULT NULL::text, filter_component text DEFAULT NULL::text, filter_source_type knowledge_source_type DEFAULT NULL::knowledge_source_type, min_authority_weight numeric DEFAULT 0, include_pending boolean DEFAULT false, match_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, source_id uuid, fact_id uuid, extraction_id uuid, content text, brand text, appliance_type text, model_family text, component text, error_code text, page_number integer, section text, source_type knowledge_source_type, source_authority knowledge_source_authority, origin knowledge_origin, confidence_score numeric, needs_review boolean, review_status text, similarity double precision, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.source_id, c.fact_id, c.extraction_id, c.content, c.brand, c.appliance_type,
    c.model_family, c.component, c.error_code, c.page_number, c.section,
    c.source_type, c.source_authority, c.origin, c.confidence_score, c.needs_review, c.review_status,
    (1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::double precision AS similarity,
    (
      (1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))
      * public.knowledge_authority_weight(c.source_authority)
      * greatest(c.confidence_score, 0.1)
      + CASE WHEN query_text IS NOT NULL AND c.content ILIKE '%' || query_text || '%' THEN 0.05 ELSE 0 END
    )::double precision AS score
  FROM public.knowledge_chunks c
  WHERE c.embedding IS NOT NULL
    AND (c.review_status = 'approved' OR (include_pending AND c.review_status = 'unreviewed'))
    AND (filter_brand IS NULL OR lower(c.brand) = lower(filter_brand))
    AND (filter_appliance_type IS NULL OR lower(c.appliance_type) = lower(filter_appliance_type))
    AND (filter_model_family IS NULL OR lower(c.model_family) = lower(filter_model_family))
    AND (filter_error_code IS NULL OR lower(c.error_code) = lower(filter_error_code))
    AND (filter_component IS NULL OR lower(c.component) = lower(filter_component))
    AND (filter_source_type IS NULL OR c.source_type = filter_source_type)
    AND public.knowledge_authority_weight(c.source_authority) >= min_authority_weight
  ORDER BY score DESC
  LIMIT greatest(match_count, 1);
$function$;
REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(vector,text,text,text,text,text,text,knowledge_source_type,numeric,boolean,integer) FROM PUBLIC, anon;
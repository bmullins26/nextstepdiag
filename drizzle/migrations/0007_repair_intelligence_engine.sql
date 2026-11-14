CREATE TABLE public.repair_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  raw_csv text NOT NULL,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','importing','imported','failed')),
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  unmapped_columns text[] NOT NULL DEFAULT '{}',
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  review_rows integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (owner_id, file_sha256)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_import_batches TO authenticated;
GRANT ALL ON public.repair_import_batches TO service_role;
ALTER TABLE public.repair_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage repair import batches" ON public.repair_import_batches
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.repair_history_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.repair_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  record_hash text NOT NULL UNIQUE,
  service_date date,
  brand_raw text NOT NULL DEFAULT '',
  brand_display text NOT NULL DEFAULT '',
  brand_key text NOT NULL DEFAULT '',
  appliance_type_raw text NOT NULL DEFAULT '',
  appliance_type text NOT NULL DEFAULT '',
  model_raw text NOT NULL DEFAULT '',
  model_display text NOT NULL DEFAULT '',
  model_key text NOT NULL DEFAULT '',
  complaint text NOT NULL DEFAULT '',
  findings text NOT NULL DEFAULT '',
  error_codes text[] NOT NULL DEFAULT '{}',
  parts_ordered text[] NOT NULL DEFAULT '{}',
  parts_installed text[] NOT NULL DEFAULT '{}',
  part_numbers text[] NOT NULL DEFAULT '{}',
  repair_actions text[] NOT NULL DEFAULT '{}',
  tests_performed text[] NOT NULL DEFAULT '{}',
  operational_result text NOT NULL DEFAULT '',
  original_outcome text NOT NULL DEFAULT '',
  normalized_outcome text NOT NULL CHECK (normalized_outcome IN ('confirmed_success','reported_success','diagnosed_pending_parts','diagnosed_not_repaired','unsuccessful_repair','working_as_designed','customer_declined','referred_to_other_service','unresolved','needs_review')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  source_verification_status text NOT NULL DEFAULT 'unverified' CHECK (source_verification_status IN ('unverified','verified','rejected')),
  source_url text,
  original_notes text NOT NULL DEFAULT '',
  original_record jsonb NOT NULL,
  unmapped_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);
CREATE INDEX repair_history_model_idx ON public.repair_history_records (brand_key, model_key);
CREATE INDEX repair_history_review_idx ON public.repair_history_records (review_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_history_records TO authenticated;
GRANT ALL ON public.repair_history_records TO service_role;
ALTER TABLE public.repair_history_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage raw repair history" ON public.repair_history_records
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

ALTER TABLE public.diagnostic_outcomes
  ADD COLUMN normalized_outcome text,
  ADD COLUMN error_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN parts_ordered text[] NOT NULL DEFAULT '{}',
  ADD COLUMN parts_installed text[] NOT NULL DEFAULT '{}',
  ADD COLUMN part_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN repair_actions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN test_results jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.diagnostic_outcomes
  ADD CONSTRAINT diagnostic_outcomes_normalized_outcome_check CHECK (
    normalized_outcome IS NULL OR normalized_outcome IN ('confirmed_success','reported_success','diagnosed_pending_parts','diagnosed_not_repaired','unsuccessful_repair','working_as_designed','customer_declined','referred_to_other_service','unresolved','needs_review')
  );

CREATE OR REPLACE FUNCTION public.normalize_live_repair_outcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.normalized_outcome := CASE
    WHEN NEW.outcome = 'pending_repair' THEN 'diagnosed_pending_parts'
    WHEN NEW.repair_successful IS false THEN 'unsuccessful_repair'
    WHEN NEW.outcome = 'confirmed' AND NEW.repair_successful IS true THEN 'confirmed_success'
    WHEN NEW.outcome = 'confirmed' THEN 'reported_success'
    WHEN NEW.outcome = 'partial' AND NEW.repair_successful IS true THEN 'reported_success'
    WHEN NEW.outcome = 'incorrect' THEN 'unsuccessful_repair'
    WHEN NEW.outcome = 'partial' THEN 'unresolved'
    ELSE 'needs_review'
  END;
  IF cardinality(NEW.parts_installed) = 0 AND nullif(btrim(NEW.part_replaced), '') IS NOT NULL THEN
    NEW.parts_installed := ARRAY[btrim(NEW.part_replaced)];
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER normalize_live_repair_outcome_trigger
BEFORE INSERT OR UPDATE ON public.diagnostic_outcomes
FOR EACH ROW EXECUTE FUNCTION public.normalize_live_repair_outcome();
UPDATE public.diagnostic_outcomes SET normalized_outcome = CASE
  WHEN outcome = 'pending_repair' THEN 'diagnosed_pending_parts'
  WHEN repair_successful IS false THEN 'unsuccessful_repair'
  WHEN outcome = 'confirmed' AND repair_successful IS true THEN 'confirmed_success'
  WHEN outcome = 'confirmed' THEN 'reported_success'
  WHEN outcome = 'partial' AND repair_successful IS true THEN 'reported_success'
  WHEN outcome = 'incorrect' THEN 'unsuccessful_repair'
  WHEN outcome = 'partial' THEN 'unresolved'
  ELSE 'needs_review' END;

CREATE TABLE public.model_repair_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key text NOT NULL,
  brand_display text NOT NULL DEFAULT '',
  model_key text NOT NULL,
  model_display text NOT NULL,
  appliance_type text NOT NULL DEFAULT '',
  service_call_count integer NOT NULL DEFAULT 0,
  historical_record_count integer NOT NULL DEFAULT 0,
  live_record_count integer NOT NULL DEFAULT 0,
  confirmed_success_count integer NOT NULL DEFAULT 0,
  reported_success_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  unsuccessful_count integer NOT NULL DEFAULT 0,
  other_outcome_count integer NOT NULL DEFAULT 0,
  complaints jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  parts_installed jsonb NOT NULL DEFAULT '[]'::jsonb,
  repair_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmation_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_strength text NOT NULL DEFAULT 'limited' CHECK (evidence_strength IN ('limited','moderate','strong')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_key, model_key)
);
GRANT SELECT ON public.model_repair_aggregates TO authenticated;
GRANT ALL ON public.model_repair_aggregates TO service_role;
ALTER TABLE public.model_repair_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Technicians read approved model aggregates" ON public.model_repair_aggregates
FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_model_repair_aggregate(p_brand_key text, p_model_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand text; v_model text; v_type text;
  v_total integer; v_historical integer; v_live integer;
  v_confirmed integer; v_reported integer; v_pending integer; v_unsuccessful integer; v_other integer;
  v_complaints jsonb; v_findings jsonb; v_codes jsonb; v_parts jsonb; v_actions jsonb; v_tests jsonb;
BEGIN
  IF p_model_key = '' THEN RETURN; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _rie_refresh_ids (key text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _rie_refresh_ids;

  WITH live_latest AS (
    SELECT DISTINCT ON (COALESCE(session_id::text, id::text)) *
    FROM public.diagnostic_outcomes
    WHERE upper(regexp_replace(manufacturer, '[^a-zA-Z0-9]', '', 'g')) = p_brand_key
      AND upper(regexp_replace(model_number, '[^a-zA-Z0-9]', '', 'g')) = p_model_key
    ORDER BY COALESCE(session_id::text, id::text), updated_at DESC
  ), unified AS (
    SELECT 'historical' source, complaint, findings, error_codes, parts_installed, repair_actions,
      tests_performed confirmation_tests, normalized_outcome, brand_display, model_display, appliance_type
    FROM public.repair_history_records
    WHERE review_status = 'approved' AND brand_key = p_brand_key AND model_key = p_model_key
    UNION ALL
    SELECT 'live', complaint, COALESCE(actual_failure, recommended_failure, ''), error_codes,
      parts_installed, repair_actions,
      CASE WHEN nullif(btrim(confirming_test), '') IS NULL THEN '{}'::text[] ELSE ARRAY[btrim(confirming_test)] END,
      normalized_outcome, manufacturer, model_number, appliance_type
    FROM live_latest WHERE normalized_outcome IS NOT NULL
  ), totals AS (
    SELECT count(*) total, count(*) FILTER (WHERE source='historical') historical,
      count(*) FILTER (WHERE source='live') live,
      count(*) FILTER (WHERE normalized_outcome='confirmed_success') confirmed,
      count(*) FILTER (WHERE normalized_outcome='reported_success') reported,
      count(*) FILTER (WHERE normalized_outcome IN ('diagnosed_pending_parts','diagnosed_not_repaired')) pending,
      count(*) FILTER (WHERE normalized_outcome='unsuccessful_repair') unsuccessful,
      count(*) FILTER (WHERE normalized_outcome NOT IN ('confirmed_success','reported_success','diagnosed_pending_parts','diagnosed_not_repaired','unsuccessful_repair')) other
    FROM unified
  )
  SELECT total,historical,live,confirmed,reported,pending,unsuccessful,other INTO v_total,v_historical,v_live,v_confirmed,v_reported,v_pending,v_unsuccessful,v_other FROM totals;

  IF v_total = 0 THEN
    DELETE FROM public.model_repair_aggregates WHERE brand_key=p_brand_key AND model_key=p_model_key;
    RETURN;
  END IF;

  WITH live_latest AS (
    SELECT DISTINCT ON (COALESCE(session_id::text, id::text)) * FROM public.diagnostic_outcomes
    WHERE upper(regexp_replace(manufacturer, '[^a-zA-Z0-9]', '', 'g')) = p_brand_key AND upper(regexp_replace(model_number, '[^a-zA-Z0-9]', '', 'g')) = p_model_key
    ORDER BY COALESCE(session_id::text, id::text), updated_at DESC
  ), unified AS (
    SELECT complaint, findings, error_codes, parts_installed, repair_actions, tests_performed confirmation_tests,
      brand_display, model_display, appliance_type FROM public.repair_history_records
    WHERE review_status='approved' AND brand_key=p_brand_key AND model_key=p_model_key
    UNION ALL
    SELECT complaint, COALESCE(actual_failure,recommended_failure,''), error_codes, parts_installed, repair_actions,
      CASE WHEN nullif(btrim(confirming_test),'') IS NULL THEN '{}'::text[] ELSE ARRAY[btrim(confirming_test)] END,
      manufacturer, model_number, appliance_type FROM live_latest WHERE normalized_outcome IS NOT NULL
  ), ranked AS (
    SELECT 'complaint' kind, btrim(value) label, count(*) count FROM unified CROSS JOIN LATERAL (SELECT complaint value) s WHERE btrim(complaint)<>'' GROUP BY btrim(value)
    UNION ALL SELECT 'finding', btrim(findings), count(*) FROM unified WHERE btrim(findings)<>'' GROUP BY btrim(findings)
    UNION ALL SELECT 'code', btrim(value), count(*) FROM unified CROSS JOIN LATERAL unnest(error_codes) value WHERE btrim(value)<>'' GROUP BY btrim(value)
    UNION ALL SELECT 'part', btrim(value), count(*) FROM unified CROSS JOIN LATERAL unnest(parts_installed) value WHERE btrim(value)<>'' GROUP BY btrim(value)
    UNION ALL SELECT 'action', btrim(value), count(*) FROM unified CROSS JOIN LATERAL unnest(repair_actions) value WHERE btrim(value)<>'' GROUP BY btrim(value)
    UNION ALL SELECT 'test', btrim(value), count(*) FROM unified CROSS JOIN LATERAL unnest(confirmation_tests) value WHERE btrim(value)<>'' GROUP BY btrim(value)
  ), aggregated AS (
    SELECT kind, jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label) stats
    FROM (SELECT kind,label,count,row_number() OVER (PARTITION BY kind ORDER BY count DESC,label) rn FROM ranked) r
    WHERE rn<=10 GROUP BY kind
  )
  SELECT
    COALESCE(max(brand_display),p_brand_key), COALESCE(max(model_display),p_model_key), COALESCE(max(appliance_type),'')
    INTO v_brand,v_model,v_type FROM unified;
  SELECT stats INTO v_complaints FROM aggregated WHERE kind='complaint';
  SELECT stats INTO v_findings FROM aggregated WHERE kind='finding';
  SELECT stats INTO v_codes FROM aggregated WHERE kind='code';
  SELECT stats INTO v_parts FROM aggregated WHERE kind='part';
  SELECT stats INTO v_actions FROM aggregated WHERE kind='action';
  SELECT stats INTO v_tests FROM aggregated WHERE kind='test';

  INSERT INTO public.model_repair_aggregates AS a (
    brand_key,brand_display,model_key,model_display,appliance_type,service_call_count,historical_record_count,live_record_count,
    confirmed_success_count,reported_success_count,pending_count,unsuccessful_count,other_outcome_count,
    complaints,findings,error_codes,parts_installed,repair_actions,confirmation_tests,evidence_strength,updated_at
  ) VALUES (
    p_brand_key,v_brand,p_model_key,v_model,v_type,v_total,v_historical,v_live,v_confirmed,v_reported,v_pending,v_unsuccessful,v_other,
    COALESCE(v_complaints,'[]'),COALESCE(v_findings,'[]'),COALESCE(v_codes,'[]'),COALESCE(v_parts,'[]'),COALESCE(v_actions,'[]'),COALESCE(v_tests,'[]'),
    CASE WHEN v_confirmed>=10 THEN 'strong' WHEN v_confirmed>=3 OR v_total>=10 THEN 'moderate' ELSE 'limited' END,now()
  )
  ON CONFLICT (brand_key,model_key) DO UPDATE SET
    brand_display=EXCLUDED.brand_display,model_display=EXCLUDED.model_display,appliance_type=EXCLUDED.appliance_type,
    service_call_count=EXCLUDED.service_call_count,historical_record_count=EXCLUDED.historical_record_count,live_record_count=EXCLUDED.live_record_count,
    confirmed_success_count=EXCLUDED.confirmed_success_count,reported_success_count=EXCLUDED.reported_success_count,
    pending_count=EXCLUDED.pending_count,unsuccessful_count=EXCLUDED.unsuccessful_count,other_outcome_count=EXCLUDED.other_outcome_count,
    complaints=EXCLUDED.complaints,findings=EXCLUDED.findings,error_codes=EXCLUDED.error_codes,parts_installed=EXCLUDED.parts_installed,
    repair_actions=EXCLUDED.repair_actions,confirmation_tests=EXCLUDED.confirmation_tests,evidence_strength=EXCLUDED.evidence_strength,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_model_repair_aggregate(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_model_repair_aggregate(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_live_model_repair_aggregate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.normalized_outcome IS NOT NULL THEN
    PERFORM public.refresh_model_repair_aggregate(upper(regexp_replace(OLD.manufacturer,'[^a-zA-Z0-9]','','g')),upper(regexp_replace(OLD.model_number,'[^a-zA-Z0-9]','','g')));
  END IF;
  PERFORM public.refresh_model_repair_aggregate(upper(regexp_replace(NEW.manufacturer,'[^a-zA-Z0-9]','','g')),upper(regexp_replace(NEW.model_number,'[^a-zA-Z0-9]','','g')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER refresh_live_model_repair_aggregate_trigger
AFTER INSERT OR UPDATE ON public.diagnostic_outcomes
FOR EACH ROW EXECUTE FUNCTION public.refresh_live_model_repair_aggregate();

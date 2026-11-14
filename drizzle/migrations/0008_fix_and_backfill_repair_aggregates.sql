CREATE OR REPLACE FUNCTION public.refresh_model_repair_aggregate(p_brand_key text, p_model_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand text; v_model text; v_type text;
  v_total integer; v_historical integer; v_live integer;
  v_confirmed integer; v_reported integer; v_pending integer; v_unsuccessful integer; v_other integer;
  v_complaints jsonb; v_findings jsonb; v_codes jsonb; v_parts jsonb; v_actions jsonb; v_tests jsonb;
BEGIN
  IF p_model_key = '' THEN RETURN; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _rie_unified (
    source text, complaint text, findings text, error_codes text[], parts_installed text[],
    repair_actions text[], confirmation_tests text[], normalized_outcome text,
    brand_display text, model_display text, appliance_type text
  ) ON COMMIT DROP;
  TRUNCATE _rie_unified;

  WITH live_latest AS (
    SELECT DISTINCT ON (COALESCE(session_id::text, id::text)) *
    FROM public.diagnostic_outcomes
    WHERE upper(regexp_replace(manufacturer, '[^a-zA-Z0-9]', '', 'g')) = p_brand_key
      AND upper(regexp_replace(model_number, '[^a-zA-Z0-9]', '', 'g')) = p_model_key
    ORDER BY COALESCE(session_id::text, id::text), updated_at DESC
  )
  INSERT INTO _rie_unified
    SELECT 'historical', complaint, findings, error_codes, parts_installed, repair_actions,
      tests_performed, normalized_outcome, brand_display, model_display, appliance_type
    FROM public.repair_history_records
    WHERE review_status = 'approved' AND brand_key = p_brand_key AND model_key = p_model_key
    UNION ALL
    SELECT 'live', complaint, COALESCE(actual_failure, recommended_failure, ''), error_codes,
      parts_installed, repair_actions,
      CASE WHEN nullif(btrim(confirming_test), '') IS NULL THEN '{}'::text[] ELSE ARRAY[btrim(confirming_test)] END,
      normalized_outcome, manufacturer, model_number, appliance_type
    FROM live_latest WHERE normalized_outcome IS NOT NULL;

  SELECT count(*), count(*) FILTER (WHERE source='historical'), count(*) FILTER (WHERE source='live'),
    count(*) FILTER (WHERE normalized_outcome='confirmed_success'),
    count(*) FILTER (WHERE normalized_outcome='reported_success'),
    count(*) FILTER (WHERE normalized_outcome IN ('diagnosed_pending_parts','diagnosed_not_repaired')),
    count(*) FILTER (WHERE normalized_outcome='unsuccessful_repair'),
    count(*) FILTER (WHERE normalized_outcome NOT IN ('confirmed_success','reported_success','diagnosed_pending_parts','diagnosed_not_repaired','unsuccessful_repair'))
  INTO v_total,v_historical,v_live,v_confirmed,v_reported,v_pending,v_unsuccessful,v_other FROM _rie_unified;

  IF v_total = 0 THEN
    DELETE FROM public.model_repair_aggregates WHERE brand_key=p_brand_key AND model_key=p_model_key;
    RETURN;
  END IF;

  SELECT COALESCE(max(brand_display),p_brand_key), COALESCE(max(model_display),p_model_key), COALESCE(max(appliance_type),'')
  INTO v_brand,v_model,v_type FROM _rie_unified;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label),'[]') INTO v_complaints
  FROM (SELECT btrim(complaint) label,count(*) count FROM _rie_unified WHERE btrim(complaint)<>'' GROUP BY btrim(complaint) ORDER BY count DESC,label LIMIT 10) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label),'[]') INTO v_findings
  FROM (SELECT btrim(findings) label,count(*) count FROM _rie_unified WHERE btrim(findings)<>'' GROUP BY btrim(findings) ORDER BY count DESC,label LIMIT 10) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label),'[]') INTO v_codes
  FROM (SELECT btrim(value) label,count(*) count FROM _rie_unified CROSS JOIN LATERAL unnest(error_codes) value WHERE btrim(value)<>'' GROUP BY btrim(value) ORDER BY count DESC,label LIMIT 10) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label),'[]') INTO v_parts
  FROM (SELECT btrim(value) label,count(*) count FROM _rie_unified CROSS JOIN LATERAL unnest(parts_installed) value WHERE btrim(value)<>'' GROUP BY btrim(value) ORDER BY count DESC,label LIMIT 10) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label),'[]') INTO v_actions
  FROM (SELECT btrim(value) label,count(*) count FROM _rie_unified CROSS JOIN LATERAL unnest(repair_actions) value WHERE btrim(value)<>'' GROUP BY btrim(value) ORDER BY count DESC,label LIMIT 10) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label',label,'count',count) ORDER BY count DESC,label),'[]') INTO v_tests
  FROM (SELECT btrim(value) label,count(*) count FROM _rie_unified CROSS JOIN LATERAL unnest(confirmation_tests) value WHERE btrim(value)<>'' GROUP BY btrim(value) ORDER BY count DESC,label LIMIT 10) s;

  INSERT INTO public.model_repair_aggregates AS a (
    brand_key,brand_display,model_key,model_display,appliance_type,service_call_count,historical_record_count,live_record_count,
    confirmed_success_count,reported_success_count,pending_count,unsuccessful_count,other_outcome_count,
    complaints,findings,error_codes,parts_installed,repair_actions,confirmation_tests,evidence_strength,updated_at
  ) VALUES (
    p_brand_key,v_brand,p_model_key,v_model,v_type,v_total,v_historical,v_live,v_confirmed,v_reported,v_pending,v_unsuccessful,v_other,
    v_complaints,v_findings,v_codes,v_parts,v_actions,v_tests,
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

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT upper(regexp_replace(manufacturer, '[^a-zA-Z0-9]', '', 'g')) AS brand_key,
      upper(regexp_replace(model_number, '[^a-zA-Z0-9]', '', 'g')) AS model_key
    FROM public.diagnostic_outcomes
    WHERE normalized_outcome IS NOT NULL AND model_number <> ''
  LOOP
    PERFORM public.refresh_model_repair_aggregate(r.brand_key, r.model_key);
  END LOOP;
END;
$$;
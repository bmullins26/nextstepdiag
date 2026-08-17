-- 1) Shared confirmed repairs: replace broad whole-row read with a safe projection.
DROP POLICY IF EXISTS "Signed in users read shared confirmed repairs" ON public.diagnostic_outcomes;

CREATE OR REPLACE VIEW public.shared_confirmed_repairs
WITH (security_barrier = true, security_invoker = false) AS
  SELECT
    o.id,
    o.user_id,
    o.manufacturer,
    o.appliance_type,
    o.model_number,
    o.complaint,
    o.actual_failure,
    o.recommended_failure,
    o.part_replaced,
    o.confirming_test,
    o.repair_successful,
    o.public_notes,
    o.confirmed_at,
    o.shared_at,
    o.created_at
  FROM public.diagnostic_outcomes o
  WHERE o.outcome = 'confirmed'
    AND o.shared_to_community = true;

GRANT SELECT ON public.shared_confirmed_repairs TO authenticated;
GRANT SELECT ON public.shared_confirmed_repairs TO service_role;

-- 2) Knowledge base: reads are served by the diagnostics engine (security definer
--    retrieval) and the owner console, so no broad member-level table read is needed.
DROP POLICY IF EXISTS "Signed in users read cleared facts" ON public.knowledge_facts;
DROP POLICY IF EXISTS "Signed in users read cleared chunks" ON public.knowledge_chunks;
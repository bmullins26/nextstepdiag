
-- 1. Fix search_path on functions missing it
ALTER FUNCTION public._beta_guess_state(text) SET search_path = public;
ALTER FUNCTION public.community_family_key(text, text) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

-- 2. Revoke anon/authenticated EXECUTE from internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;

-- 3. Replace always-true UPDATE policy on appliance_type_overrides
DROP POLICY IF EXISTS "Authenticated can update overrides" ON public.appliance_type_overrides;
CREATE POLICY "Authenticated can update overrides"
  ON public.appliance_type_overrides
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (corrected_by = auth.uid());

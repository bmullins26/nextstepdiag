REVOKE ALL ON FUNCTION public.handle_new_user_subscription() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_pro_access(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.increment_lookup(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_pro_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_lookup(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can update overrides" ON public.appliance_type_overrides;
CREATE POLICY "Users update own overrides or owners update any"
ON public.appliance_type_overrides
FOR UPDATE
TO authenticated
USING (corrected_by = auth.uid() OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (corrected_by = auth.uid() OR public.has_role(auth.uid(), 'owner'));
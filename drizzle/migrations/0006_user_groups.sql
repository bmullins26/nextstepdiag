CREATE TABLE public.user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_key text NOT NULL CHECK (group_key IN ('beta','freds','outsider')),
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_key)
);
GRANT SELECT ON public.user_groups TO authenticated;
GRANT ALL ON public.user_groups TO service_role;
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read user groups" ON public.user_groups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
-- Backfill existing Fred's claims and active beta testers into their groups.
INSERT INTO public.user_groups (user_id, group_key)
  SELECT DISTINCT user_id, 'freds' FROM public.partner_perk_claims WHERE partner = 'freds_academy'
  ON CONFLICT DO NOTHING;
INSERT INTO public.user_groups (user_id, group_key)
  SELECT DISTINCT user_id, 'beta' FROM public.beta_applications WHERE user_id IS NOT NULL AND access_status = 'active'
  ON CONFLICT DO NOTHING;
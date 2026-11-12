CREATE TABLE public.partner_perk_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner text NOT NULL,
  perk text NOT NULL DEFAULT 'pro_90_days',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (user_id, partner)
);
GRANT SELECT ON public.partner_perk_claims TO authenticated;
GRANT ALL ON public.partner_perk_claims TO service_role;
ALTER TABLE public.partner_perk_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own perk claims" ON public.partner_perk_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners read all perk claims" ON public.partner_perk_claims FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
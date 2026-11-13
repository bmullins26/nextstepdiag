ALTER TABLE public.partner_perk_claims
  ADD COLUMN verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid,
  ADD COLUMN owner_note text;
CREATE INDEX partner_perk_claims_partner_idx ON public.partner_perk_claims (partner, claimed_at DESC);
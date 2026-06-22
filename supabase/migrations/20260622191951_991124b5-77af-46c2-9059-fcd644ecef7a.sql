CREATE TABLE public.appliance_type_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key text NOT NULL,
  model_key text NOT NULL,
  brand_display text NOT NULL,
  model_display text NOT NULL,
  appliance_type text NOT NULL,
  sub_type text,
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  correction_count integer NOT NULL DEFAULT 1,
  hit_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appliance_type_overrides_brand_model_unique UNIQUE (brand_key, model_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appliance_type_overrides TO authenticated;
GRANT ALL ON public.appliance_type_overrides TO service_role;

ALTER TABLE public.appliance_type_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read overrides"
  ON public.appliance_type_overrides FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert overrides"
  ON public.appliance_type_overrides FOR INSERT
  TO authenticated
  WITH CHECK (corrected_by = auth.uid());

CREATE POLICY "Authenticated can update overrides"
  ON public.appliance_type_overrides FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Owners can delete overrides"
  ON public.appliance_type_overrides FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER trg_appliance_type_overrides_updated_at
  BEFORE UPDATE ON public.appliance_type_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_appliance_type_overrides_last_used ON public.appliance_type_overrides (last_used_at DESC NULLS LAST);
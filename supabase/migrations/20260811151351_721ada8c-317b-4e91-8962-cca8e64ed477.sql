CREATE TABLE public.model_production_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer text NOT NULL,
  brand text,
  model_prefix text NOT NULL,
  introduced_year integer,
  discontinued_year integer,
  replacement_series text,
  source text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer, model_prefix)
);

GRANT SELECT ON public.model_production_windows TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.model_production_windows TO authenticated;
GRANT ALL ON public.model_production_windows TO service_role;

ALTER TABLE public.model_production_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read production windows"
  ON public.model_production_windows FOR SELECT TO authenticated USING (true);
CREATE POLICY "owners manage production windows insert"
  ON public.model_production_windows FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners manage production windows update"
  ON public.model_production_windows FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners manage production windows delete"
  ON public.model_production_windows FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER model_production_windows_updated_at
  BEFORE UPDATE ON public.model_production_windows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_model_windows_prefix ON public.model_production_windows (manufacturer, model_prefix);

-- Rule analytics + rejection logging on decode attempts
ALTER TABLE public.age_decode_attempts
  ADD COLUMN IF NOT EXISTS confidence_percent integer,
  ADD COLUMN IF NOT EXISTS rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS format_id text;

CREATE INDEX IF NOT EXISTS idx_age_decode_attempts_rule ON public.age_decode_attempts (rule_id, created_at DESC);
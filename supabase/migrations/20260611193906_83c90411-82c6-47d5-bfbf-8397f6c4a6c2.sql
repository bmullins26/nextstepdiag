DROP TABLE IF EXISTS public.error_codes;

CREATE TABLE public.error_code_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  appliance_type text NOT NULL DEFAULT '',
  model_number text NOT NULL DEFAULT '',
  code text NOT NULL,
  meaning text NOT NULL,
  common_causes jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_notes text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT 'medium',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT error_code_cache_unique UNIQUE (brand, appliance_type, model_number, code)
);

GRANT SELECT ON public.error_code_cache TO authenticated;
GRANT ALL ON public.error_code_cache TO service_role;

ALTER TABLE public.error_code_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached error codes"
  ON public.error_code_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX error_code_cache_lookup_idx
  ON public.error_code_cache (brand, appliance_type, model_number, code);

CREATE TRIGGER set_error_code_cache_updated_at
  BEFORE UPDATE ON public.error_code_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

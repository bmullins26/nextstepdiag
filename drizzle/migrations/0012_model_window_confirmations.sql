ALTER TABLE public.model_production_windows
  ADD COLUMN IF NOT EXISTS brand_key text,
  ADD COLUMN IF NOT EXISTS evidence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_min_year integer,
  ADD COLUMN IF NOT EXISTS observed_max_year integer;
ALTER TABLE public.model_production_windows
  ADD CONSTRAINT model_production_windows_source_chk
    CHECK (source IS NULL OR source IN ('owner','tech_confirmed')),
  ADD CONSTRAINT model_production_windows_observed_chk
    CHECK (observed_min_year IS NULL OR observed_max_year IS NULL OR observed_min_year <= observed_max_year);
CREATE UNIQUE INDEX IF NOT EXISTS model_production_windows_brandkey_prefix_uidx
  ON public.model_production_windows (brand_key, upper(model_prefix));
CREATE INDEX IF NOT EXISTS age_decode_ground_truth_lookup_idx
  ON public.age_decode_ground_truth (lower(manufacturer), upper(serial_number));
GRANT ALL ON public.model_production_windows TO service_role;
REVOKE ALL ON public.model_production_windows FROM anon;
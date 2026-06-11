-- Expand error_codes to support appliance-type and model-level precision.
ALTER TABLE public.error_codes
  ADD COLUMN IF NOT EXISTS appliance_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS service_notes text NOT NULL DEFAULT '';

-- Drop old uniqueness; add precise composite unique so the same code
-- can repeat across appliance types and models.
ALTER TABLE public.error_codes
  DROP CONSTRAINT IF EXISTS error_codes_brand_code_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'error_codes_brand_appliance_model_code_key'
  ) THEN
    ALTER TABLE public.error_codes
      ADD CONSTRAINT error_codes_brand_appliance_model_code_key
      UNIQUE (brand, appliance_type, model_number, code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS error_codes_lookup_idx
  ON public.error_codes (brand, appliance_type, model_number, code);

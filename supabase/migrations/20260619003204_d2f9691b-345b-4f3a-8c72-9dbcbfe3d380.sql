
CREATE TABLE public.tech_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model_number text NOT NULL,
  platform_family text,
  source_url text,
  source_type text NOT NULL DEFAULT 'other',
  source_trust text NOT NULL DEFAULT 'community' CHECK (source_trust IN ('oem','trusted_reference','community')),
  content_markdown text,
  fault_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('exact_model','platform_family','manufacturer_family','low')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, model_number)
);

GRANT SELECT ON public.tech_sheets TO authenticated;
GRANT ALL ON public.tech_sheets TO service_role;

ALTER TABLE public.tech_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tech sheets"
  ON public.tech_sheets FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_tech_sheets_updated_at
  BEFORE UPDATE ON public.tech_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tech_sheets_brand_model ON public.tech_sheets (lower(brand), lower(model_number));

-- Lookup log for analytics
CREATE TABLE public.tech_sheet_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  brand text NOT NULL,
  model_number text NOT NULL,
  outcome text NOT NULL,        -- 'hit' | 'miss_fetched' | 'miss_low'
  cache_hit boolean NOT NULL DEFAULT false,
  confidence text NOT NULL,
  source_trust text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tech_sheet_lookups TO authenticated;
GRANT ALL ON public.tech_sheet_lookups TO service_role;

ALTER TABLE public.tech_sheet_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read own lookups"
  ON public.tech_sheet_lookups FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));

CREATE INDEX idx_tech_sheet_lookups_created_at ON public.tech_sheet_lookups (created_at DESC);

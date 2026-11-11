CREATE TABLE public.model_parts_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL UNIQUE,
  model_display text NOT NULL,
  brand text,
  provider text NOT NULL,
  model_url text,
  diagrams jsonb NOT NULL DEFAULT '[]'::jsonb,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  part_count integer NOT NULL DEFAULT 0,
  hit_count integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.model_parts_catalogs IS 'Permanent per-model parts diagrams pulled once from external parts sites; shared grounding for all diagnostics.';
GRANT SELECT ON public.model_parts_catalogs TO authenticated;
GRANT ALL ON public.model_parts_catalogs TO service_role;
ALTER TABLE public.model_parts_catalogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read parts catalogs" ON public.model_parts_catalogs FOR SELECT TO authenticated USING (true);
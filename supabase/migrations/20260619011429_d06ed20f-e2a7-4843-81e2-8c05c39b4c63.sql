CREATE TABLE public.age_decode_corroborations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_key TEXT NOT NULL,
  model_number TEXT NOT NULL,
  query TEXT NOT NULL,
  hits JSONB NOT NULL DEFAULT '[]'::jsonb,
  year_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_count INTEGER NOT NULL DEFAULT 0,
  best_trust TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_key, model_number)
);

GRANT SELECT ON public.age_decode_corroborations TO authenticated;
GRANT ALL ON public.age_decode_corroborations TO service_role;

ALTER TABLE public.age_decode_corroborations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read corroboration cache"
  ON public.age_decode_corroborations
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER set_age_decode_corroborations_updated_at
  BEFORE UPDATE ON public.age_decode_corroborations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX age_decode_corroborations_expires_idx
  ON public.age_decode_corroborations (expires_at);

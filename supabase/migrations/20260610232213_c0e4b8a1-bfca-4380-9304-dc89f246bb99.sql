
CREATE TABLE public.diagnostic_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  brand TEXT NOT NULL DEFAULT '',
  appliance_type TEXT NOT NULL DEFAULT '',
  model_number TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  manufacture_year INT,
  age_years NUMERIC,
  complaint TEXT NOT NULL DEFAULT '',
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  most_likely_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  most_likely_failure TEXT NOT NULL DEFAULT '',
  recommended_next_test TEXT NOT NULL DEFAULT '',
  current_findings_summary TEXT NOT NULL DEFAULT '',
  appliance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostic_sessions TO authenticated;
GRANT ALL ON public.diagnostic_sessions TO service_role;

ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own diagnostic sessions"
  ON public.diagnostic_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX diagnostic_sessions_user_updated_idx
  ON public.diagnostic_sessions (user_id, updated_at DESC);
CREATE INDEX diagnostic_sessions_user_status_idx
  ON public.diagnostic_sessions (user_id, status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER diagnostic_sessions_set_updated_at
  BEFORE UPDATE ON public.diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

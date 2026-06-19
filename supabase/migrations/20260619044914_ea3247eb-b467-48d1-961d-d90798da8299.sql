
CREATE TABLE public.appliance_age_api_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_key text NOT NULL,
  model_number text NOT NULL,
  serial_number text NOT NULL,
  manufacture_year integer,
  manufacture_month integer,
  confidence_percent integer,
  alternative_years jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response jsonb NOT NULL,
  status_code integer NOT NULL,
  success boolean NOT NULL,
  response_time_ms integer,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_key, model_number, serial_number)
);

CREATE INDEX appliance_age_api_cache_lookup_idx
  ON public.appliance_age_api_cache (brand_key, model_number, serial_number, expires_at);

GRANT SELECT ON public.appliance_age_api_cache TO authenticated;
GRANT ALL ON public.appliance_age_api_cache TO service_role;

ALTER TABLE public.appliance_age_api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read api cache"
  ON public.appliance_age_api_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER appliance_age_api_cache_set_updated_at
  BEFORE UPDATE ON public.appliance_age_api_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.appliance_age_api_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  brand text NOT NULL,
  model_number text NOT NULL,
  serial_number text NOT NULL,
  event text NOT NULL,
  source text,
  status_code integer,
  response_time_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.appliance_age_api_log TO authenticated;
GRANT ALL ON public.appliance_age_api_log TO service_role;

ALTER TABLE public.appliance_age_api_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own api log rows"
  ON public.appliance_age_api_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Owners can read all api log rows"
  ON public.appliance_age_api_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));

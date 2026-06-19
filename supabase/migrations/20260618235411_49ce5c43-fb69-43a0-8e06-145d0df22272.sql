CREATE TABLE public.age_decode_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decoder_version text NOT NULL,
  manufacturer text NOT NULL,
  appliance_type text,
  model_number text NOT NULL,
  serial_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','unknown')),
  confidence text,
  rule_id text,
  manufacture_year int,
  manufacture_month int,
  unknown_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX age_decode_attempts_created_at_idx ON public.age_decode_attempts (created_at DESC);
CREATE INDEX age_decode_attempts_mfr_status_idx ON public.age_decode_attempts (manufacturer, status);

GRANT SELECT, INSERT ON public.age_decode_attempts TO authenticated;
GRANT ALL ON public.age_decode_attempts TO service_role;

ALTER TABLE public.age_decode_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own decode attempts"
  ON public.age_decode_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read their own decode attempts"
  ON public.age_decode_attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners read all decode attempts"
  ON public.age_decode_attempts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
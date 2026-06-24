
CREATE TABLE public.diagnostic_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  manufacturer text NOT NULL DEFAULT '',
  model_number text NOT NULL DEFAULT '',
  appliance_type text NOT NULL DEFAULT '',
  platform text NULL,
  complaint text NOT NULL DEFAULT '',
  recommended_failure text NOT NULL DEFAULT '',
  actual_failure text NULL,
  notes text NULL,
  outcome text NOT NULL CHECK (outcome IN ('confirmed','incorrect','partial','pending_repair')),
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostic_outcomes TO authenticated;
GRANT ALL ON public.diagnostic_outcomes TO service_role;

ALTER TABLE public.diagnostic_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outcomes"
  ON public.diagnostic_outcomes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users insert own outcomes"
  ON public.diagnostic_outcomes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own outcomes"
  ON public.diagnostic_outcomes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own outcomes"
  ON public.diagnostic_outcomes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_diagnostic_outcomes_updated_at
  BEFORE UPDATE ON public.diagnostic_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_diagnostic_outcomes_user_outcome
  ON public.diagnostic_outcomes (user_id, outcome);

CREATE INDEX idx_diagnostic_outcomes_lookup
  ON public.diagnostic_outcomes (manufacturer, model_number, appliance_type, complaint);

CREATE INDEX idx_diagnostic_outcomes_pending
  ON public.diagnostic_outcomes (user_id, created_at DESC)
  WHERE outcome = 'pending_repair';

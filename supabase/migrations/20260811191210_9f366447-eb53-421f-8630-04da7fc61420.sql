ALTER TABLE public.diagnostic_outcomes
  ADD COLUMN IF NOT EXISTS part_replaced text,
  ADD COLUMN IF NOT EXISTS confirming_test text,
  ADD COLUMN IF NOT EXISTS repair_successful boolean,
  ADD COLUMN IF NOT EXISTS unusual_notes text,
  ADD COLUMN IF NOT EXISTS nextstep_verdict text,
  ADD COLUMN IF NOT EXISTS predicted_top_failure text,
  ADD COLUMN IF NOT EXISTS predicted_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS predicted_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tests_performed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS public_notes text,
  ADD COLUMN IF NOT EXISTS shared_to_community boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;

ALTER TABLE public.diagnostic_outcomes
  DROP CONSTRAINT IF EXISTS diagnostic_outcomes_nextstep_verdict_check;
ALTER TABLE public.diagnostic_outcomes
  ADD CONSTRAINT diagnostic_outcomes_nextstep_verdict_check
  CHECK (nextstep_verdict IS NULL OR nextstep_verdict IN ('correct','partial','incorrect'));

CREATE POLICY "Signed in users read shared confirmed repairs"
  ON public.diagnostic_outcomes
  FOR SELECT
  TO authenticated
  USING (outcome = 'confirmed' AND shared_to_community = true);

CREATE INDEX IF NOT EXISTS diagnostic_outcomes_shared_idx
  ON public.diagnostic_outcomes (shared_to_community, created_at DESC)
  WHERE outcome = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS community_discussions_verified_outcome_uidx
  ON public.community_discussions (verified_outcome_id)
  WHERE verified_outcome_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  outcome_id uuid REFERENCES public.diagnostic_outcomes(id) ON DELETE SET NULL,
  discussion_id uuid REFERENCES public.community_discussions(id) ON DELETE SET NULL,
  weight numeric NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.contribution_events TO authenticated;
GRANT ALL ON public.contribution_events TO service_role;

ALTER TABLE public.contribution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own contribution events"
  ON public.contribution_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own contribution events"
  ON public.contribution_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

CREATE INDEX IF NOT EXISTS contribution_events_user_idx
  ON public.contribution_events (user_id, created_at DESC);
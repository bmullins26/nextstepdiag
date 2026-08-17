ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS cost_usd numeric;

CREATE INDEX IF NOT EXISTS ai_usage_provider_idx ON public.ai_usage (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_session_idx ON public.ai_usage (session_id);

CREATE TABLE IF NOT EXISTS public.jenova_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diagnostic_session_id uuid NOT NULL UNIQUE,
  jenova_session_id text NOT NULL,
  agent_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.jenova_sessions TO authenticated;
GRANT ALL ON public.jenova_sessions TO service_role;

ALTER TABLE public.jenova_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own jenova sessions" ON public.jenova_sessions;
CREATE POLICY "Users read their own jenova sessions"
  ON public.jenova_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
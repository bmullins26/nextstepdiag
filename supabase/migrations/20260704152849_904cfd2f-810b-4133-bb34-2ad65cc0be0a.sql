
-- ============================================================
-- Community + Unified Evidence Engine
-- ============================================================

-- Track which evidence items an AI diagnostic used
ALTER TABLE public.diagnostic_sessions
  ADD COLUMN IF NOT EXISTS evidence_used jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------
-- Model family helper (mirrors src/lib/appliance/model-family.ts)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_family_key(brand text, model text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(brand,''), '[^A-Za-z0-9]', '', 'g'))
      || ':'
      || CASE
           WHEN length(regexp_replace(coalesce(model,''), '[^A-Za-z0-9]', '', 'g')) > 4
             THEN substr(upper(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')), 1,
                         greatest(4, length(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')) - 2))
           ELSE upper(regexp_replace(coalesce(model,''), '[^A-Za-z0-9]', '', 'g'))
         END;
$$;

-- ------------------------------------------------------------
-- community_discussions
-- ------------------------------------------------------------
CREATE TABLE public.community_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand text NOT NULL,
  appliance_type text NOT NULL,
  model_number text NOT NULL,
  family_key text GENERATED ALWAYS AS (public.community_family_key(brand, model_number)) STORED,
  complaint text NOT NULL,
  error_code text,
  confirmed_failure text,
  discussion_type text NOT NULL CHECK (discussion_type IN (
    'general','repair_tip','question','confirmed_repair','diagnostic_advice',
    'part_recommendation','installation_tip','tech_sheet','service_bulletin'
  )),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  verified_outcome_id uuid REFERENCES public.diagnostic_outcomes(id) ON DELETE SET NULL,
  view_count int NOT NULL DEFAULT 0,
  reply_count int NOT NULL DEFAULT 0,
  like_count int NOT NULL DEFAULT 0,
  helpful_count int NOT NULL DEFAULT 0,
  solved_reply_id uuid,
  tags text[] NOT NULL DEFAULT '{}',
  confirmed_success_count int NOT NULL DEFAULT 0,
  confirmed_failure_count int NOT NULL DEFAULT 0,
  success_rate real,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_discussions TO authenticated;
GRANT ALL ON public.community_discussions TO service_role;
ALTER TABLE public.community_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read discussions"
  ON public.community_discussions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own discussions"
  ON public.community_discussions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Author or owner updates discussion"
  ON public.community_discussions FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR has_role(auth.uid(), 'owner'))
  WITH CHECK (auth.uid() = author_id OR has_role(auth.uid(), 'owner'));
CREATE POLICY "Author or owner deletes discussion"
  ON public.community_discussions FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR has_role(auth.uid(), 'owner'));

CREATE INDEX community_discussions_brand_type_model_idx
  ON public.community_discussions (brand, appliance_type, model_number);
CREATE INDEX community_discussions_family_idx
  ON public.community_discussions (brand, family_key);
CREATE INDEX community_discussions_model_complaint_idx
  ON public.community_discussions (model_number, complaint);
CREATE INDEX community_discussions_created_idx
  ON public.community_discussions (created_at DESC);
CREATE INDEX community_discussions_helpful_idx
  ON public.community_discussions (helpful_count DESC);
CREATE INDEX community_discussions_tags_idx
  ON public.community_discussions USING GIN (tags);

CREATE TRIGGER community_discussions_updated_at
  BEFORE UPDATE ON public.community_discussions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- community_replies
-- ------------------------------------------------------------
CREATE TABLE public.community_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES public.community_discussions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_reply_id uuid REFERENCES public.community_replies(id) ON DELETE CASCADE,
  body text NOT NULL,
  like_count int NOT NULL DEFAULT 0,
  helpful_count int NOT NULL DEFAULT 0,
  not_helpful_count int NOT NULL DEFAULT 0,
  is_solved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_replies TO authenticated;
GRANT ALL ON public.community_replies TO service_role;
ALTER TABLE public.community_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read replies"
  ON public.community_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own replies"
  ON public.community_replies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Author or owner updates reply"
  ON public.community_replies FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR has_role(auth.uid(), 'owner'))
  WITH CHECK (auth.uid() = author_id OR has_role(auth.uid(), 'owner'));
CREATE POLICY "Author or owner deletes reply"
  ON public.community_replies FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR has_role(auth.uid(), 'owner'));

CREATE INDEX community_replies_discussion_idx
  ON public.community_replies (discussion_id, created_at);

CREATE TRIGGER community_replies_updated_at
  BEFORE UPDATE ON public.community_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Discussion reply-count trigger
CREATE OR REPLACE FUNCTION public._community_bump_reply_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_discussions
       SET reply_count = reply_count + 1
     WHERE id = NEW.discussion_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_discussions
       SET reply_count = greatest(reply_count - 1, 0)
     WHERE id = OLD.discussion_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER community_replies_bump_count
  AFTER INSERT OR DELETE ON public.community_replies
  FOR EACH ROW EXECUTE FUNCTION public._community_bump_reply_count();

-- ------------------------------------------------------------
-- community_reactions
-- ------------------------------------------------------------
CREATE TABLE public.community_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('discussion','reply')),
  target_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like','helpful','solved','not_helpful')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id, reaction)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_reactions TO authenticated;
GRANT ALL ON public.community_reactions TO service_role;
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read reactions"
  ON public.community_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own reactions"
  ON public.community_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own reactions"
  ON public.community_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX community_reactions_target_idx
  ON public.community_reactions (target_type, target_id);

-- Reaction counter trigger
CREATE OR REPLACE FUNCTION public._community_bump_reaction_counts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  delta int;
  r record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := 1; r := NEW;
  ELSE
    delta := -1; r := OLD;
  END IF;

  IF r.target_type = 'discussion' THEN
    IF r.reaction = 'like' THEN
      UPDATE public.community_discussions SET like_count = greatest(like_count + delta, 0) WHERE id = r.target_id;
    ELSIF r.reaction = 'helpful' THEN
      UPDATE public.community_discussions SET helpful_count = greatest(helpful_count + delta, 0) WHERE id = r.target_id;
    END IF;
  ELSIF r.target_type = 'reply' THEN
    IF r.reaction = 'like' THEN
      UPDATE public.community_replies SET like_count = greatest(like_count + delta, 0) WHERE id = r.target_id;
    ELSIF r.reaction = 'helpful' THEN
      UPDATE public.community_replies SET helpful_count = greatest(helpful_count + delta, 0) WHERE id = r.target_id;
    ELSIF r.reaction = 'not_helpful' THEN
      UPDATE public.community_replies SET not_helpful_count = greatest(not_helpful_count + delta, 0) WHERE id = r.target_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER community_reactions_bump
  AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public._community_bump_reaction_counts();

-- ------------------------------------------------------------
-- community_attachments
-- ------------------------------------------------------------
CREATE TABLE public.community_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discussion_id uuid REFERENCES public.community_discussions(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES public.community_replies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((discussion_id IS NOT NULL) OR (reply_id IS NOT NULL))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_attachments TO authenticated;
GRANT ALL ON public.community_attachments TO service_role;
ALTER TABLE public.community_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read attachments"
  ON public.community_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own attachments"
  ON public.community_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploader_id);
CREATE POLICY "Author or owner deletes attachment"
  ON public.community_attachments FOR DELETE TO authenticated
  USING (auth.uid() = uploader_id OR has_role(auth.uid(), 'owner'));

CREATE INDEX community_attachments_discussion_idx
  ON public.community_attachments (discussion_id);
CREATE INDEX community_attachments_reply_idx
  ON public.community_attachments (reply_id);

-- ------------------------------------------------------------
-- community_insight_feedback (learning loop)
-- ------------------------------------------------------------
CREATE TABLE public.community_insight_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
  discussion_id uuid NOT NULL REFERENCES public.community_discussions(id) ON DELETE CASCADE,
  insight_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_response text CHECK (user_response IN ('helpful','not_helpful')),
  final_outcome text CHECK (final_outcome IN ('confirmed','incorrect','partial','pending_repair')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, discussion_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_insight_feedback TO authenticated;
GRANT ALL ON public.community_insight_feedback TO service_role;
ALTER TABLE public.community_insight_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own feedback or owner reads all"
  ON public.community_insight_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'owner'));
CREATE POLICY "Users insert own feedback"
  ON public.community_insight_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own feedback"
  ON public.community_insight_feedback FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own feedback"
  ON public.community_insight_feedback FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX community_feedback_discussion_idx
  ON public.community_insight_feedback (discussion_id);
CREATE INDEX community_feedback_session_idx
  ON public.community_insight_feedback (session_id);

CREATE TRIGGER community_feedback_updated_at
  BEFORE UPDATE ON public.community_insight_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recompute discussion success rate from feedback rows
CREATE OR REPLACE FUNCTION public._community_recompute_success(disc_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  s int; f int; rate real;
BEGIN
  SELECT
    count(*) FILTER (WHERE final_outcome = 'confirmed'),
    count(*) FILTER (WHERE final_outcome = 'incorrect')
    INTO s, f
  FROM public.community_insight_feedback
  WHERE discussion_id = disc_id;

  IF (s + f) >= 3 THEN
    rate := s::real / (s + f);
  ELSE
    rate := NULL;
  END IF;

  UPDATE public.community_discussions
     SET confirmed_success_count = s,
         confirmed_failure_count = f,
         success_rate = rate
   WHERE id = disc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._community_feedback_after()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._community_recompute_success(OLD.discussion_id);
    RETURN OLD;
  ELSE
    PERFORM public._community_recompute_success(NEW.discussion_id);
    IF TG_OP = 'UPDATE' AND OLD.discussion_id <> NEW.discussion_id THEN
      PERFORM public._community_recompute_success(OLD.discussion_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER community_feedback_after
  AFTER INSERT OR UPDATE OR DELETE ON public.community_insight_feedback
  FOR EACH ROW EXECUTE FUNCTION public._community_feedback_after();

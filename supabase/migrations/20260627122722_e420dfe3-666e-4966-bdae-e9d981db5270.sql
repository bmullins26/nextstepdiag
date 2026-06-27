
-- 1) CREATE TABLE
CREATE TABLE public.beta_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  company text,
  location text NOT NULL,
  experience_years int NOT NULL,
  role text NOT NULL,
  calls_per_week int NOT NULL,
  primary_brands jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  video_interview text CHECK (video_interview IN ('yes','maybe','no')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','invited','active','waitlisted','declined')),
  beta_wave int NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'public_form',
  invite_code text,
  referred_by uuid,
  notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  invited_at timestamptz,
  activated_at timestamptz,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) GRANTS
GRANT INSERT ON public.beta_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_applications TO authenticated;
GRANT ALL ON public.beta_applications TO service_role;

-- 3) ENABLE RLS
ALTER TABLE public.beta_applications ENABLE ROW LEVEL SECURITY;

-- 4) POLICIES
-- Anon can only INSERT a fresh pending public-form application
CREATE POLICY "Anon can submit public applications"
  ON public.beta_applications FOR INSERT TO anon
  WITH CHECK (status = 'pending' AND beta_wave = 1 AND source = 'public_form');

-- Authenticated can also submit (same constraint)
CREATE POLICY "Authenticated can submit public applications"
  ON public.beta_applications FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND beta_wave = 1 AND source = 'public_form');

-- Owners can see and manage everything
CREATE POLICY "Owners can read all applications"
  ON public.beta_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can update all applications"
  ON public.beta_applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can delete applications"
  ON public.beta_applications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- Indexes
CREATE INDEX idx_beta_apps_status_created ON public.beta_applications (status, created_at DESC);
CREATE INDEX idx_beta_apps_email ON public.beta_applications (lower(email));
CREATE INDEX idx_beta_apps_wave ON public.beta_applications (beta_wave);
CREATE INDEX idx_beta_apps_user_id ON public.beta_applications (user_id);

-- Updated_at trigger (reuses existing public.set_updated_at)
CREATE TRIGGER trg_beta_apps_updated_at
  BEFORE UPDATE ON public.beta_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend handle_new_user to auto-link beta applications when an invited tester signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name',
             NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link any beta_applications row sharing this email (case-insensitive)
  UPDATE public.beta_applications
     SET user_id = NEW.id,
         activated_at = COALESCE(activated_at, now()),
         status = CASE
           WHEN status IN ('invited','approved') THEN 'active'
           ELSE status
         END
   WHERE lower(email) = lower(COALESCE(NEW.email, ''))
     AND user_id IS NULL;

  RETURN NEW;
END;
$$;

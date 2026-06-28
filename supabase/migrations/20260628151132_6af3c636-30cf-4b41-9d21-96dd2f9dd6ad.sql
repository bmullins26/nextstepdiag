
-- 1) New columns
ALTER TABLE public.beta_applications
  ADD COLUMN IF NOT EXISTS application_status text,
  ADD COLUMN IF NOT EXISTS access_status text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS location_raw text,
  ADD COLUMN IF NOT EXISTS owner_notes text,
  ADD COLUMN IF NOT EXISTS owner_notes_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_notes_updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS owner_rating smallint,
  ADD COLUMN IF NOT EXISTS owner_labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_reason text,
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz;

-- 2) Back-fill location_raw + state (best-effort)
UPDATE public.beta_applications SET location_raw = location WHERE location_raw IS NULL;

CREATE OR REPLACE FUNCTION public._beta_guess_state(input text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text := upper(coalesce(input, ''));
  abbr_map jsonb := '{
    "AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California",
    "CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia",
    "HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa",
    "KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland",
    "MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri",
    "MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey",
    "NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio",
    "OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina",
    "SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont",
    "VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming",
    "DC":"District of Columbia"
  }'::jsonb;
  k text;
  full_name text;
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  -- exact abbrev match
  FOR k IN SELECT jsonb_object_keys(abbr_map) LOOP
    IF s ~ ('(^|[^A-Z])' || k || '([^A-Z]|$)') THEN
      RETURN abbr_map->>k;
    END IF;
  END LOOP;
  -- full name match
  FOR k IN SELECT jsonb_object_keys(abbr_map) LOOP
    full_name := upper(abbr_map->>k);
    IF position(full_name IN s) > 0 THEN
      RETURN abbr_map->>k;
    END IF;
  END LOOP;
  -- fallback: last comma segment title-cased
  RETURN initcap(trim(split_part(coalesce(input,''), ',', -1)));
END;
$$;

UPDATE public.beta_applications
   SET state = public._beta_guess_state(location)
 WHERE state IS NULL;

-- 3) Back-fill application_status + access_status from legacy status
UPDATE public.beta_applications SET
  application_status = CASE
    WHEN status IN ('approved','invited','active') THEN 'approved'
    WHEN status = 'waitlisted' THEN 'waitlisted'
    WHEN status = 'declined' THEN 'declined'
    ELSE 'pending'
  END,
  access_status = CASE
    WHEN status = 'active' THEN 'active'
    WHEN status = 'invited' THEN 'invited'
    ELSE 'not_invited'
  END
WHERE application_status IS NULL OR access_status IS NULL;

-- 4) Constraints + defaults on new status columns
ALTER TABLE public.beta_applications
  ALTER COLUMN application_status SET DEFAULT 'pending',
  ALTER COLUMN application_status SET NOT NULL,
  ALTER COLUMN access_status SET DEFAULT 'not_invited',
  ALTER COLUMN access_status SET NOT NULL;

ALTER TABLE public.beta_applications
  DROP CONSTRAINT IF EXISTS beta_applications_application_status_check,
  DROP CONSTRAINT IF EXISTS beta_applications_access_status_check,
  DROP CONSTRAINT IF EXISTS beta_applications_owner_rating_check;

ALTER TABLE public.beta_applications
  ADD CONSTRAINT beta_applications_application_status_check
    CHECK (application_status IN ('pending','approved','waitlisted','declined')),
  ADD CONSTRAINT beta_applications_access_status_check
    CHECK (access_status IN ('not_invited','invited','active','suspended','deactivated')),
  ADD CONSTRAINT beta_applications_owner_rating_check
    CHECK (owner_rating IS NULL OR (owner_rating BETWEEN 1 AND 5));

CREATE INDEX IF NOT EXISTS idx_beta_apps_application_status ON public.beta_applications(application_status);
CREATE INDEX IF NOT EXISTS idx_beta_apps_access_status ON public.beta_applications(access_status);
CREATE INDEX IF NOT EXISTS idx_beta_apps_state ON public.beta_applications(state);

-- 5) Drop unused video_interview column + its CHECK
ALTER TABLE public.beta_applications
  DROP CONSTRAINT IF EXISTS beta_applications_video_interview_check;
ALTER TABLE public.beta_applications DROP COLUMN IF EXISTS video_interview;

-- 6) Trigger: stamp suspended_at / deactivated_at on transitions
CREATE OR REPLACE FUNCTION public._beta_access_status_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.access_status IS DISTINCT FROM OLD.access_status THEN
    IF NEW.access_status = 'suspended' THEN
      NEW.suspended_at = now();
    ELSIF NEW.access_status = 'deactivated' THEN
      NEW.deactivated_at = now();
    ELSIF NEW.access_status = 'active' THEN
      NEW.suspended_at = NULL;
      NEW.deactivated_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_beta_access_status_stamp ON public.beta_applications;
CREATE TRIGGER trg_beta_access_status_stamp
  BEFORE UPDATE OF access_status ON public.beta_applications
  FOR EACH ROW EXECUTE FUNCTION public._beta_access_status_stamp();

-- 7) Update handle_new_user to flip access_status to active on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name',
             NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.beta_applications
     SET user_id = NEW.id,
         activated_at = COALESCE(activated_at, now()),
         invite_accepted_at = COALESCE(invite_accepted_at, now()),
         access_status = CASE
           WHEN application_status = 'approved'
                AND access_status IN ('invited','not_invited')
             THEN 'active'
           ELSE access_status
         END,
         status = CASE
           WHEN status IN ('invited','approved') THEN 'active'
           ELSE status
         END
   WHERE lower(email) = lower(COALESCE(NEW.email, ''))
     AND user_id IS NULL;

  RETURN NEW;
END;
$$;

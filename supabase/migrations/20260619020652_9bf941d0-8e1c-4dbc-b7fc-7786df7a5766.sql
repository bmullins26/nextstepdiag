CREATE TABLE public.age_decode_ground_truth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  manufacturer text NOT NULL,
  model_number text,
  serial_number text NOT NULL,
  known_year integer NOT NULL,
  known_month integer,
  source text,
  notes text,
  decoder_year integer,
  decoder_confidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, manufacturer, serial_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.age_decode_ground_truth TO authenticated;
GRANT ALL ON public.age_decode_ground_truth TO service_role;

ALTER TABLE public.age_decode_ground_truth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own ground truth"
  ON public.age_decode_ground_truth FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owners view all ground truth"
  ON public.age_decode_ground_truth FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER set_age_decode_ground_truth_updated_at
  BEFORE UPDATE ON public.age_decode_ground_truth
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
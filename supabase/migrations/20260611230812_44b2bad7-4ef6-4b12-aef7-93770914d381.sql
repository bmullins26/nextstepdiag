ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
UPDATE public.profiles SET display_name = NULLIF(full_name, '') WHERE display_name IS NULL;
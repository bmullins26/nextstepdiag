CREATE OR REPLACE FUNCTION public.consume_diagnostic(_user_id uuid, _session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit int := 8;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_used int;
BEGIN
  IF _session_id IS NULL THEN
    RAISE EXCEPTION 'diagnostic_session_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.diagnostic_sessions
    WHERE id = _session_id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'diagnostic_session_not_found';
  END IF;

  IF public.has_pro_access(_user_id) THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', -1, 'pro', true);
  END IF;

  -- Serialize allowance decisions per technician and month so simultaneous
  -- new sessions cannot both consume the same final free slot.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || v_month::text, 0)
  );

  SELECT count(*) INTO v_used
  FROM public.diagnostic_usage
  WHERE user_id = _user_id AND period_month = v_month;

  -- A saved session remains included even when work resumes in a later month.
  IF EXISTS (
    SELECT 1 FROM public.diagnostic_usage
    WHERE user_id = _user_id AND session_id = _session_id
  ) THEN
    RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'pro', false);
  END IF;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'pro', false);
  END IF;

  INSERT INTO public.diagnostic_usage (user_id, period_month, session_id)
  VALUES (_user_id, v_month, _session_id);

  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit, 'pro', false);
END;
$$;
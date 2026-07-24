
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','past_due','trialing','grandfathered','incomplete','unpaid','paused')),
  plan_type text CHECK (plan_type IN ('week_pass','monthly','annual','grandfathered')),
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  price_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners view all subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Service manages subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.usage_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  lookups_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_month)
);

GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage"
  ON public.usage_counters FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service manages usage"
  ON public.usage_counters FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER usage_counters_updated_at
  BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tech_talk_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  parent_id uuid REFERENCES public.tech_talk_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tech_talk_channel_created ON public.tech_talk_messages(channel, created_at DESC);
CREATE INDEX idx_tech_talk_parent ON public.tech_talk_messages(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_talk_messages TO authenticated;
GRANT ALL ON public.tech_talk_messages TO service_role;

ALTER TABLE public.tech_talk_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_pro_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND tier = 'pro'
      AND (
        plan_type = 'grandfathered'
        OR (current_period_end IS NOT NULL AND current_period_end > now())
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_pro_access(uuid) TO authenticated, service_role;

CREATE POLICY "Pro users read tech talk"
  ON public.tech_talk_messages FOR SELECT
  TO authenticated
  USING (public.has_pro_access(auth.uid()));

CREATE POLICY "Pro users post tech talk"
  ON public.tech_talk_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_pro_access(auth.uid()));

CREATE POLICY "Users edit own tech talk"
  ON public.tech_talk_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.has_pro_access(auth.uid()))
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own tech talk"
  ON public.tech_talk_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners moderate tech talk"
  ON public.tech_talk_messages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER tech_talk_messages_updated_at
  BEFORE UPDATE ON public.tech_talk_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.increment_lookup(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit int := 8;
  v_month date := date_trunc('month', now())::date;
  v_used int;
BEGIN
  IF public.has_pro_access(_user_id) THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', -1, 'pro', true);
  END IF;

  INSERT INTO public.usage_counters (user_id, period_month, lookups_used)
  VALUES (_user_id, v_month, 0)
  ON CONFLICT (user_id, period_month) DO NOTHING;

  SELECT lookups_used INTO v_used
  FROM public.usage_counters
  WHERE user_id = _user_id AND period_month = v_month
  FOR UPDATE;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'pro', false);
  END IF;

  UPDATE public.usage_counters
     SET lookups_used = lookups_used + 1
   WHERE user_id = _user_id AND period_month = v_month
  RETURNING lookups_used INTO v_used;

  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'pro', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_lookup(uuid) TO service_role;

INSERT INTO public.subscriptions (user_id, tier, status, plan_type, current_period_end)
SELECT id, 'pro', 'grandfathered', 'grandfathered', NULL
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, tier, status, plan_type)
  VALUES (NEW.id, 'free', 'active', NULL)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

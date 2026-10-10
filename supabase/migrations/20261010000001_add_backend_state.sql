CREATE TABLE IF NOT EXISTS public.electricity_app_state (
  id text PRIMARY KEY CHECK (id = 'owner'),
  shop_registry jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_periods jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_period jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.electricity_app_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.electricity_app_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.electricity_app_state TO service_role;

CREATE TABLE IF NOT EXISTS public.electricity_processed_webhooks (
  message_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.electricity_processed_webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.electricity_processed_webhooks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.electricity_processed_webhooks TO service_role;
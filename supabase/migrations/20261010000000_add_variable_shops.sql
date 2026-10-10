ALTER TABLE public.electricity_bills
  ADD COLUMN IF NOT EXISTS shops jsonb,
  ADD COLUMN IF NOT EXISTS shop_registry jsonb;
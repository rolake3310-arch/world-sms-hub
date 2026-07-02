-- ============ SMM (social media marketing / follower-boost) feature ============

-- App settings additions
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS smm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smm_api_url text NOT NULL DEFAULT 'https://justanotherpanel.com/api/v2',
  ADD COLUMN IF NOT EXISTS smm_markup numeric NOT NULL DEFAULT 1.3;

-- Orders placed against the SMM provider
CREATE TABLE IF NOT EXISTS public.smm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_order_id text,
  service_id text NOT NULL,
  service_name text NOT NULL,
  category text,
  link text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  charge_usd numeric(14,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  start_count integer,
  remains integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS smm_orders_user_idx ON public.smm_orders(user_id);
CREATE INDEX IF NOT EXISTS smm_orders_created_idx ON public.smm_orders(created_at DESC);

GRANT SELECT ON public.smm_orders TO authenticated;
GRANT ALL ON public.smm_orders TO service_role;
ALTER TABLE public.smm_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own smm orders" ON public.smm_orders;
CREATE POLICY "users read own smm orders" ON public.smm_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));

-- Admin per-service price overrides (price is USD per 1000 units, matches provider convention)
CREATE TABLE IF NOT EXISTS public.smm_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text NOT NULL UNIQUE,
  price_per_1000_usd numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.smm_prices TO authenticated;
GRANT ALL ON public.smm_prices TO service_role;
ALTER TABLE public.smm_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated reads smm prices" ON public.smm_prices;
CREATE POLICY "authenticated reads smm prices" ON public.smm_prices FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "admins manage smm prices" ON public.smm_prices;
CREATE POLICY "admins manage smm prices" ON public.smm_prices FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));


-- Add bank_transfer to deposit method enum (safe re-run)
DO $$ BEGIN
  ALTER TYPE deposit_method ADD VALUE IF NOT EXISTS 'bank_transfer';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- App settings additions
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bank_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_instructions text,
  ADD COLUMN IF NOT EXISTS min_fund_usd numeric NOT NULL DEFAULT 0;

-- Bank accounts table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  extra text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bank_accounts TO anon, authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads active bank accounts" ON public.bank_accounts;
CREATE POLICY "anyone reads active bank accounts" ON public.bank_accounts
  FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage bank accounts" ON public.bank_accounts;
CREATE POLICY "admins manage bank accounts" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

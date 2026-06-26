
-- 1) Move has_role out of exposed API schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Recreate policies to use private.has_role, then drop public.has_role

-- user_roles
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- profiles
DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins update any profile" ON public.profiles;
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- app_settings: drop public read, only authenticated read
DROP POLICY IF EXISTS "anyone reads settings" ON public.app_settings;
CREATE POLICY "authenticated reads settings" ON public.app_settings FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "admins write settings" ON public.app_settings;
CREATE POLICY "admins write settings" ON public.app_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.app_settings FROM anon;

-- crypto_wallets
DROP POLICY IF EXISTS "anyone reads active wallets" ON public.crypto_wallets;
CREATE POLICY "authenticated reads active wallets" ON public.crypto_wallets FOR SELECT TO authenticated
  USING (active = true OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins manage wallets" ON public.crypto_wallets;
CREATE POLICY "admins manage wallets" ON public.crypto_wallets FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.crypto_wallets FROM anon;

-- country_prices
DROP POLICY IF EXISTS "admins manage country prices" ON public.country_prices;
CREATE POLICY "admins manage country prices" ON public.country_prices FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- deposits
DROP POLICY IF EXISTS "users read own deposits" ON public.deposits;
CREATE POLICY "users read own deposits" ON public.deposits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins update deposits" ON public.deposits;
CREATE POLICY "admins update deposits" ON public.deposits FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- sms_messages
DROP POLICY IF EXISTS "users read own sms" ON public.sms_messages;
CREATE POLICY "users read own sms" ON public.sms_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));

-- bank_accounts: authenticated only
DROP POLICY IF EXISTS "anyone reads active bank accounts" ON public.bank_accounts;
CREATE POLICY "authenticated reads active bank accounts" ON public.bank_accounts FOR SELECT TO authenticated
  USING (active = true OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins manage bank accounts" ON public.bank_accounts;
CREATE POLICY "admins manage bank accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.bank_accounts FROM anon;

-- 3) Drop the public has_role now that no policy references it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 4) Restrict profile self-updates to non-sensitive columns (prevents users from
--    self-crediting balance_usd or changing status via the Data API).
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (email, full_name) ON public.profiles TO authenticated;

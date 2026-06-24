
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.deposit_method AS ENUM ('crypto', 'squad');
CREATE TYPE public.deposit_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.sms_status AS ENUM ('queued', 'sent', 'failed');
CREATE TYPE public.user_status AS ENUM ('active', 'suspended');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  balance_usd NUMERIC(14,4) NOT NULL DEFAULT 0,
  status public.user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Profiles policies (depend on has_role)
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users update own profile basic" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger: auto-create profile + assign first user as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ APP SETTINGS (singleton) ============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  crypto_enabled BOOLEAN NOT NULL DEFAULT true,
  squad_enabled BOOLEAN NOT NULL DEFAULT false,
  default_price_usd NUMERIC(10,4) NOT NULL DEFAULT 0.05,
  squad_public_key TEXT,
  squad_environment TEXT NOT NULL DEFAULT 'sandbox',
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins write settings" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ CRYPTO WALLETS ============
CREATE TABLE public.crypto_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  asset TEXT NOT NULL,
  network TEXT,
  address TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crypto_wallets TO anon, authenticated;
GRANT ALL ON public.crypto_wallets TO service_role;
ALTER TABLE public.crypto_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active wallets" ON public.crypto_wallets FOR SELECT TO anon, authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage wallets" ON public.crypto_wallets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ COUNTRY PRICES ============
CREATE TABLE public.country_prices (
  country_code TEXT PRIMARY KEY,
  country_name TEXT NOT NULL,
  price_usd NUMERIC(10,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.country_prices TO anon, authenticated;
GRANT ALL ON public.country_prices TO service_role;
ALTER TABLE public.country_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads country prices" ON public.country_prices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage country prices" ON public.country_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ DEPOSITS ============
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method public.deposit_method NOT NULL,
  amount_usd NUMERIC(14,4) NOT NULL CHECK (amount_usd > 0),
  status public.deposit_status NOT NULL DEFAULT 'pending',
  asset TEXT,
  tx_reference TEXT,
  squad_ref TEXT UNIQUE,
  proof_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX deposits_user_idx ON public.deposits(user_id);
CREATE INDEX deposits_status_idx ON public.deposits(status);
GRANT SELECT, INSERT ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own deposits" ON public.deposits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users create own deposits" ON public.deposits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins update deposits" ON public.deposits FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SMS MESSAGES ============
CREATE TABLE public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  country_code TEXT,
  message TEXT NOT NULL,
  segments INT NOT NULL DEFAULT 1,
  cost_usd NUMERIC(14,4) NOT NULL DEFAULT 0,
  gateway_id TEXT,
  status public.sms_status NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sms_user_idx ON public.sms_messages(user_id);
CREATE INDEX sms_created_idx ON public.sms_messages(created_at DESC);
GRANT SELECT ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own sms" ON public.sms_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ BALANCE HELPERS (security definer) ============
-- Atomic debit, used by sendSms server fn
CREATE OR REPLACE FUNCTION public.debit_balance(_user_id UUID, _amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.profiles
     SET balance_usd = balance_usd - _amount
   WHERE id = _user_id AND balance_usd >= _amount
   RETURNING balance_usd INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  RETURN new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_balance(_user_id UUID, _amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.profiles SET balance_usd = balance_usd + _amount
   WHERE id = _user_id RETURNING balance_usd INTO new_balance;
  RETURN new_balance;
END;
$$;

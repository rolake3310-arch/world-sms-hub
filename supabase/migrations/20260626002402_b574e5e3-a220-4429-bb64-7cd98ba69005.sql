
-- Revoke EXECUTE from signed-in users on sensitive SECURITY DEFINER functions.
-- has_role must remain callable by authenticated (used inside RLS policies).
REVOKE EXECUTE ON FUNCTION public.credit_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_balance(uuid, numeric) TO service_role;

-- Explicit admin-only write policies on user_roles.
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

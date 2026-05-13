-- Migration 010: Fix profile RLS recursion and add profile recovery RPC
-- The previous admin policies queried public.profiles from policies on
-- public.profiles, which can trigger infinite-recursion errors under RLS.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_status() = 'approved', false)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'admin' AND public.current_user_status() = 'approved', false)
$$;

CREATE OR REPLACE FUNCTION public.is_quality_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('quality', 'admin') AND public.current_user_status() = 'approved', false)
$$;

CREATE OR REPLACE FUNCTION public.ensure_current_user_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_metadata jsonb := COALESCE(auth.jwt()->'user_metadata', '{}'::jsonb);
  v_profile public.profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, area, job_title, role, status)
  VALUES (
    v_user_id,
    COALESCE(NULLIF(v_metadata->>'full_name', ''), split_part(v_email, '@', 1), 'Usuário'),
    v_email,
    NULLIF(v_metadata->>'area', ''),
    NULLIF(v_metadata->>'job_title', ''),
    'user',
    'pending'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    area = COALESCE(EXCLUDED.area, public.profiles.area),
    job_title = COALESCE(EXCLUDED.job_title, public.profiles.job_title),
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, area, job_title, role, status)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'area', ''),
    NULLIF(NEW.raw_user_meta_data->>'job_title', ''),
    'user',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "user_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_update_any_profile" ON public.profiles;

CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT USING (public.is_admin_user());

CREATE POLICY "user_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.current_user_role()
    AND status = public.current_user_status()
  );

CREATE POLICY "admin_update_any_profile" ON public.profiles
  FOR UPDATE USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "approved_read_products" ON public.product_master;
DROP POLICY IF EXISTS "approved_insert_products" ON public.product_master;
DROP POLICY IF EXISTS "admin_update_products" ON public.product_master;
DROP POLICY IF EXISTS "approved_read_stages" ON public.process_stages;
DROP POLICY IF EXISTS "approved_read_defects" ON public.defect_types;
DROP POLICY IF EXISTS "approved_read_lots" ON public.rework_lots;
DROP POLICY IF EXISTS "approved_insert_lots" ON public.rework_lots;
DROP POLICY IF EXISTS "approved_read_movements" ON public.lot_movements;
DROP POLICY IF EXISTS "approved_read_balances" ON public.lot_stage_balances;
DROP POLICY IF EXISTS "approved_read_quality" ON public.quality_events;
DROP POLICY IF EXISTS "approved_read_scrap" ON public.scrap_events;
DROP POLICY IF EXISTS "approved_read_attachments" ON public.attachments;
DROP POLICY IF EXISTS "approved_insert_attachments" ON public.attachments;
DROP POLICY IF EXISTS "admin_read_audit" ON public.audit_log;
DROP POLICY IF EXISTS "admin_manage_snapshots" ON public.legacy_rework_snapshots;

CREATE POLICY "approved_read_products" ON public.product_master
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_insert_products" ON public.product_master
  FOR INSERT WITH CHECK (public.is_approved_user());

CREATE POLICY "admin_update_products" ON public.product_master
  FOR UPDATE USING (public.is_admin_user());

CREATE POLICY "approved_read_stages" ON public.process_stages
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_read_defects" ON public.defect_types
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_read_lots" ON public.rework_lots
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_insert_lots" ON public.rework_lots
  FOR INSERT WITH CHECK (public.is_approved_user());

CREATE POLICY "approved_read_movements" ON public.lot_movements
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_read_balances" ON public.lot_stage_balances
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_read_quality" ON public.quality_events
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_read_scrap" ON public.scrap_events
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_read_attachments" ON public.attachments
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "approved_insert_attachments" ON public.attachments
  FOR INSERT WITH CHECK (public.is_approved_user());

CREATE POLICY "admin_read_audit" ON public.audit_log
  FOR SELECT USING (public.is_admin_user());

CREATE POLICY "admin_manage_snapshots" ON public.legacy_rework_snapshots
  FOR ALL USING (public.is_admin_user());

GRANT EXECUTE ON FUNCTION public.ensure_current_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_quality_user() TO authenticated;

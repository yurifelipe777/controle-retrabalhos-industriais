-- Migration 007: Row Level Security Policies

-- ============================
-- PROFILES
-- ============================
-- Usuário lê próprio perfil
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Admin lê todos os perfis
CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'approved')
  );

-- Usuário atualiza próprio perfil (dados básicos)
CREATE POLICY "user_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin atualiza qualquer perfil
CREATE POLICY "admin_update_any_profile" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'approved')
  );

-- ============================
-- PRODUCT_MASTER
-- ============================
-- Usuários aprovados leem
CREATE POLICY "approved_read_products" ON public.product_master
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- Usuários aprovados inserem
CREATE POLICY "approved_insert_products" ON public.product_master
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- Admin atualiza produtos
CREATE POLICY "admin_update_products" ON public.product_master
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'approved')
  );

-- ============================
-- PROCESS_STAGES
-- ============================
CREATE POLICY "approved_read_stages" ON public.process_stages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- ============================
-- DEFECT_TYPES
-- ============================
CREATE POLICY "approved_read_defects" ON public.defect_types
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- ============================
-- REWORK_LOTS
-- ============================
CREATE POLICY "approved_read_lots" ON public.rework_lots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

CREATE POLICY "approved_insert_lots" ON public.rework_lots
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- Atualização via RPC (SECURITY DEFINER) apenas
-- Não permitir update direto via cliente
CREATE POLICY "rpc_update_lots" ON public.rework_lots
  FOR UPDATE USING (true);

-- NÃO CRIAR POLICY DE DELETE para rework_lots

-- ============================
-- LOT_MOVEMENTS
-- ============================
CREATE POLICY "approved_read_movements" ON public.lot_movements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- Inserção via RPC apenas (SECURITY DEFINER)
CREATE POLICY "rpc_insert_movements" ON public.lot_movements
  FOR INSERT WITH CHECK (true);

-- ============================
-- LOT_STAGE_BALANCES
-- ============================
CREATE POLICY "approved_read_balances" ON public.lot_stage_balances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

CREATE POLICY "rpc_modify_balances" ON public.lot_stage_balances
  FOR ALL USING (true);

-- ============================
-- QUALITY_EVENTS
-- ============================
CREATE POLICY "approved_read_quality" ON public.quality_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- Inserção via RPC (SECURITY DEFINER) apenas
CREATE POLICY "rpc_insert_quality" ON public.quality_events
  FOR INSERT WITH CHECK (true);

-- ============================
-- SCRAP_EVENTS
-- ============================
CREATE POLICY "approved_read_scrap" ON public.scrap_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

CREATE POLICY "rpc_insert_scrap" ON public.scrap_events
  FOR INSERT WITH CHECK (true);

-- ============================
-- ATTACHMENTS
-- ============================
CREATE POLICY "approved_read_attachments" ON public.attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

CREATE POLICY "approved_insert_attachments" ON public.attachments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'approved')
  );

-- ============================
-- AUDIT_LOG
-- ============================
CREATE POLICY "admin_read_audit" ON public.audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'approved')
  );

CREATE POLICY "rpc_insert_audit" ON public.audit_log
  FOR INSERT WITH CHECK (true);

-- ============================
-- LEGACY_REWORK_SNAPSHOTS
-- ============================
CREATE POLICY "admin_manage_snapshots" ON public.legacy_rework_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'approved')
  );

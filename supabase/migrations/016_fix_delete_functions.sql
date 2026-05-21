-- Migration 016: Corrige factory_reset (DELETE sem WHERE bloqueado pelo pg_safeupdate)
-- e admin_delete_rework_lot (não tratava decapagem_events adicionados na migration 014)

-- ============================
-- factory_reset: usa WHERE true para satisfazer pg_safeupdate
-- ============================
CREATE OR REPLACE FUNCTION public.factory_reset()
RETURNS void AS $$
DECLARE
  v_user_id    uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();

  SELECT email INTO v_user_email
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_email IS DISTINCT FROM 'ynascimento@caloi.com' THEN
    RAISE EXCEPTION 'Acesso negado: esta operação é restrita ao administrador do sistema.';
  END IF;

  -- Quebra referência circular antes de deletar
  UPDATE public.rework_lots
  SET originated_from_decapagem_id = NULL
  WHERE originated_from_decapagem_id IS NOT NULL;

  -- Apaga dados transacionais (WHERE true satisfaz o pg_safeupdate)
  DELETE FROM public.quality_events    WHERE true;
  DELETE FROM public.scrap_events      WHERE true;
  DELETE FROM public.attachments       WHERE lot_id IS NOT NULL;
  DELETE FROM public.lot_stage_balances WHERE true;
  DELETE FROM public.lot_movements     WHERE true;
  DELETE FROM public.decapagem_events  WHERE true;
  DELETE FROM public.rework_lots       WHERE true;
  DELETE FROM public.audit_log         WHERE true;

  -- Registra o reset no log limpo
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'system', NULL, 'factory_reset',
    jsonb_build_object('reset_by', v_user_email, 'reset_at', now()),
    v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================
-- admin_delete_rework_lot: trata decapagem_events antes de deletar o lote
-- ============================
CREATE OR REPLACE FUNCTION public.admin_delete_rework_lot(
  p_lot_id uuid
)
RETURNS void AS $$
DECLARE
  v_user_id  uuid;
  v_old_data jsonb;
BEGIN
  v_user_id := auth.uid();

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem excluir lotes';
  END IF;

  SELECT to_jsonb(rl.*) INTO v_old_data
  FROM public.rework_lots rl WHERE id = p_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado: %', p_lot_id;
  END IF;

  -- Registra exclusão ANTES de deletar
  INSERT INTO public.audit_log (table_name, record_id, action, old_data, user_id)
  VALUES ('rework_lots', p_lot_id::text, 'admin_delete', v_old_data, v_user_id);

  -- Limpa referências de outros lotes que apontam para decapagem_events deste lote
  UPDATE public.rework_lots
  SET originated_from_decapagem_id = NULL
  WHERE originated_from_decapagem_id IN (
    SELECT id FROM public.decapagem_events WHERE lot_id = p_lot_id
  );

  -- Cancela eventos de decapagem que registraram este lote como retorno
  UPDATE public.decapagem_events
  SET returned_lot_id  = NULL,
      status           = 'cancelled',
      return_notes     = 'Lote de retorno excluído pelo administrador'
  WHERE returned_lot_id = p_lot_id;

  -- Remove a referência circular do próprio lote
  UPDATE public.rework_lots
  SET originated_from_decapagem_id = NULL
  WHERE id = p_lot_id AND originated_from_decapagem_id IS NOT NULL;

  -- Remove registros dependentes
  DELETE FROM public.attachments        WHERE lot_id = p_lot_id;
  DELETE FROM public.quality_events     WHERE lot_id = p_lot_id;
  DELETE FROM public.scrap_events       WHERE lot_id = p_lot_id;
  DELETE FROM public.lot_stage_balances WHERE lot_id = p_lot_id;
  DELETE FROM public.lot_movements      WHERE lot_id = p_lot_id;
  DELETE FROM public.decapagem_events   WHERE lot_id = p_lot_id;
  DELETE FROM public.rework_lots        WHERE id     = p_lot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

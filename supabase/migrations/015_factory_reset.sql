-- Migration 015: Factory Reset — zera todos os lançamentos transacionais
-- Acesso restrito ao usuário ynascimento@caloi.com

CREATE OR REPLACE FUNCTION public.factory_reset()
RETURNS void AS $$
DECLARE
  v_user_id    uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();

  -- Busca o e-mail do usuário autenticado a partir da tabela de perfis
  SELECT email INTO v_user_email
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_email IS DISTINCT FROM 'ynascimento@caloi.com' THEN
    RAISE EXCEPTION 'Acesso negado: esta operação é restrita ao administrador do sistema.';
  END IF;

  -- 1. Quebra referência circular: rework_lots.originated_from_decapagem_id → decapagem_events
  UPDATE public.rework_lots
  SET originated_from_decapagem_id = NULL
  WHERE originated_from_decapagem_id IS NOT NULL;

  -- 2. Apaga dados transacionais em ordem de dependência
  DELETE FROM public.quality_events;
  DELETE FROM public.scrap_events;
  DELETE FROM public.attachments WHERE lot_id IS NOT NULL;
  DELETE FROM public.lot_stage_balances;
  DELETE FROM public.lot_movements;
  DELETE FROM public.decapagem_events;
  DELETE FROM public.rework_lots;
  DELETE FROM public.audit_log;

  -- Registra no audit_log o próprio reset (após o delete para gerar novo log limpo)
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'system', NULL, 'factory_reset',
    jsonb_build_object('reset_by', v_user_email, 'reset_at', now()),
    v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

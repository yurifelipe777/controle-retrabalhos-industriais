-- Migration 008: Funções RPC transacionais

-- ============================
-- Criar lote de retrabalho
-- ============================
CREATE OR REPLACE FUNCTION public.create_rework_lot(
  p_part_number_id uuid,
  p_quantity_initial numeric,
  p_origin_area text,
  p_initial_stage_id uuid,
  p_defect_type_id uuid,
  p_defect_description text,
  p_quality_block_required boolean DEFAULT true,
  p_quality_block_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(lot_id uuid, lot_code text) AS $$
DECLARE
  v_lot_id uuid;
  v_lot_code text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Usuário não aprovado';
  END IF;

  IF p_quantity_initial <= 0 THEN
    RAISE EXCEPTION 'Quantidade inicial deve ser maior que zero';
  END IF;

  v_lot_code := generate_lot_code();
  v_lot_id := gen_random_uuid();

  INSERT INTO public.rework_lots (
    id, lot_code, part_number_id, quantity_initial, quantity_open,
    origin_area, current_status, quality_status,
    defect_type_id, defect_description,
    quality_block_required, quality_block_number,
    created_by
  ) VALUES (
    v_lot_id, v_lot_code, p_part_number_id, p_quantity_initial, p_quantity_initial,
    p_origin_area, 'open', 'pending_block',
    p_defect_type_id, p_defect_description,
    p_quality_block_required, p_quality_block_number,
    v_user_id
  );

  -- Movimento inicial (trigger atualiza lot_stage_balances)
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    v_lot_id, NULL, p_initial_stage_id, p_quantity_initial, 'initial', v_user_id, p_notes
  );

  -- Audit log
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'rework_lots', v_lot_id, 'create_lot',
    jsonb_build_object('lot_code', v_lot_code, 'quantity_initial', p_quantity_initial, 'origin_area', p_origin_area),
    v_user_id
  );

  RETURN QUERY SELECT v_lot_id, v_lot_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- Movimentar quantidade entre etapas
-- ============================
CREATE OR REPLACE FUNCTION public.move_lot_quantity(
  p_lot_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_available numeric;
  v_user_id uuid;
  v_lot_status text;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  -- Verificar se lote existe e não está encerrado
  SELECT current_status INTO v_lot_status FROM public.rework_lots WHERE id = p_lot_id;
  IF v_lot_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'Lote encerrado ou cancelado — movimentação não permitida';
  END IF;

  IF p_from_stage_id = p_to_stage_id THEN
    RAISE EXCEPTION 'Etapa de origem e destino devem ser diferentes';
  END IF;

  -- Verificar saldo com lock
  SELECT balance_quantity INTO v_available
  FROM public.lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %',
      COALESCE(v_available, 0), p_quantity;
  END IF;

  -- Criar movimento (trigger atualiza saldos)
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    p_lot_id, p_from_stage_id, p_to_stage_id, p_quantity, 'transfer', v_user_id, p_notes
  );

  -- Atualizar status do lote se estava 'open'
  UPDATE public.rework_lots
  SET current_status = 'in_rework', updated_at = now()
  WHERE id = p_lot_id AND current_status = 'open';

  -- Audit log
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'lot_movements', p_lot_id, 'move_quantity',
    jsonb_build_object('from_stage', p_from_stage_id, 'to_stage', p_to_stage_id, 'quantity', p_quantity),
    v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- Bloquear lote (Qualidade)
-- ============================
CREATE OR REPLACE FUNCTION public.block_lot(
  p_lot_id uuid,
  p_quality_document text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada: apenas quality ou admin pode bloquear lotes';
  END IF;

  UPDATE public.rework_lots
  SET quality_status = 'blocked',
      quality_block_number = COALESCE(p_quality_document, quality_block_number),
      updated_at = now()
  WHERE id = p_lot_id;

  INSERT INTO public.quality_events (lot_id, event_type, quality_document, notes, created_by)
  VALUES (p_lot_id, 'block', p_quality_document, p_notes, v_user_id);

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('quality_events', p_lot_id, 'block_lot',
    jsonb_build_object('quality_document', p_quality_document), v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- Aprovar quantidade (Qualidade)
-- ============================
CREATE OR REPLACE FUNCTION public.approve_quantity(
  p_lot_id uuid,
  p_from_stage_id uuid,
  p_quantity numeric,
  p_quality_document text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_available numeric;
  v_approved_stage_id uuid;
  v_new_open numeric;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT id INTO v_approved_stage_id FROM public.process_stages WHERE name = 'Aprovado';

  SELECT balance_quantity INTO v_available
  FROM public.lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  IF COALESCE(v_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente para aprovação';
  END IF;

  -- Mover para Aprovado
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (p_lot_id, p_from_stage_id, v_approved_stage_id, p_quantity, 'transfer', v_user_id, p_notes);

  INSERT INTO public.quality_events (
    lot_id, event_type, quantity, result, quality_document, notes, created_by
  ) VALUES (p_lot_id, 'approve', p_quantity, 'approved', p_quality_document, p_notes, v_user_id);

  UPDATE public.rework_lots
  SET quantity_open = quantity_open - p_quantity, updated_at = now()
  WHERE id = p_lot_id;

  SELECT quantity_open INTO v_new_open FROM public.rework_lots WHERE id = p_lot_id;

  UPDATE public.rework_lots
  SET current_status = CASE WHEN v_new_open = 0 THEN 'approved' ELSE 'partially_approved' END,
      quality_status = CASE WHEN v_new_open = 0 THEN 'approved' ELSE quality_status END,
      closed_at = CASE WHEN v_new_open = 0 THEN now() ELSE NULL END
  WHERE id = p_lot_id;

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('quality_events', p_lot_id, 'approve_quantity',
    jsonb_build_object('quantity', p_quantity, 'remaining', v_new_open), v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- Enviar para sucata
-- ============================
CREATE OR REPLACE FUNCTION public.send_to_scrap(
  p_lot_id uuid,
  p_from_stage_id uuid,
  p_quantity numeric,
  p_reason text
)
RETURNS void AS $$
DECLARE
  v_available numeric;
  v_scrap_stage_id uuid;
  v_new_open numeric;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo de sucata é obrigatório';
  END IF;

  SELECT id INTO v_scrap_stage_id FROM public.process_stages WHERE name = 'Sucata';

  SELECT balance_quantity INTO v_available
  FROM public.lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  IF COALESCE(v_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (p_lot_id, p_from_stage_id, v_scrap_stage_id, p_quantity, 'transfer', v_user_id, p_reason);

  INSERT INTO public.quality_events (
    lot_id, event_type, quantity, result, notes, created_by
  ) VALUES (p_lot_id, 'send_to_scrap', p_quantity, 'scrap', p_reason, v_user_id);

  INSERT INTO public.scrap_events (lot_id, quantity, reason, approved_by)
  VALUES (p_lot_id, p_quantity, p_reason, v_user_id);

  UPDATE public.rework_lots
  SET quantity_open = quantity_open - p_quantity, updated_at = now()
  WHERE id = p_lot_id;

  SELECT quantity_open INTO v_new_open FROM public.rework_lots WHERE id = p_lot_id;

  UPDATE public.rework_lots
  SET current_status = CASE WHEN v_new_open = 0 THEN 'scrapped' ELSE 'partially_scrapped' END,
      quality_status = 'scrap_approved'
  WHERE id = p_lot_id;

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('scrap_events', p_lot_id, 'send_to_scrap',
    jsonb_build_object('quantity', p_quantity, 'reason', p_reason), v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- Encerrar lote
-- ============================
CREATE OR REPLACE FUNCTION public.close_lot(p_lot_id uuid)
RETURNS void AS $$
DECLARE
  v_open numeric;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT quantity_open INTO v_open FROM public.rework_lots WHERE id = p_lot_id;

  IF v_open > 0 THEN
    RAISE EXCEPTION 'Lote não pode ser encerrado: ainda há % peças em aberto', v_open;
  END IF;

  UPDATE public.rework_lots
  SET current_status = 'closed', closed_at = now(), updated_at = now()
  WHERE id = p_lot_id;

  INSERT INTO public.audit_log (table_name, record_id, action, user_id)
  VALUES ('rework_lots', p_lot_id, 'close_lot', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

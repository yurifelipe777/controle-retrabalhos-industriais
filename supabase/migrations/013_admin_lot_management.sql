-- Migration 013: Funções de gestão de lotes para Admin (edição completa + exclusão)

-- ──────────────────────────────────────────────────────────────────────────────
-- admin_update_rework_lot: edição de todos os campos do lote (admin only)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_rework_lot(
  p_lot_id               uuid,
  p_part_number_id       uuid,
  p_quantity_initial     numeric,
  p_quantity_open        numeric,
  p_origin_area          text,
  p_current_status       text,
  p_quality_status       text,
  p_defect_type_id       uuid,
  p_defect_description   text,
  p_quality_block_required boolean,
  p_quality_block_number text    DEFAULT NULL,
  p_opened_at            timestamptz DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_user_id  uuid;
  v_old_data jsonb;
BEGIN
  v_user_id := auth.uid();

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem editar lotes diretamente';
  END IF;

  SELECT to_jsonb(rl.*) INTO v_old_data
  FROM public.rework_lots rl WHERE id = p_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado: %', p_lot_id;
  END IF;

  UPDATE public.rework_lots SET
    part_number_id         = p_part_number_id,
    quantity_initial       = p_quantity_initial,
    quantity_open          = p_quantity_open,
    origin_area            = p_origin_area,
    current_status         = p_current_status,
    quality_status         = p_quality_status,
    defect_type_id         = p_defect_type_id,
    defect_description     = p_defect_description,
    quality_block_required = p_quality_block_required,
    quality_block_number   = NULLIF(TRIM(COALESCE(p_quality_block_number, '')), ''),
    opened_at              = COALESCE(p_opened_at, opened_at),
    updated_at             = now()
  WHERE id = p_lot_id;

  INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, user_id)
  VALUES (
    'rework_lots', p_lot_id::text, 'admin_update',
    v_old_data,
    jsonb_build_object(
      'part_number_id',        p_part_number_id,
      'quantity_initial',      p_quantity_initial,
      'quantity_open',         p_quantity_open,
      'origin_area',           p_origin_area,
      'current_status',        p_current_status,
      'quality_status',        p_quality_status,
      'defect_type_id',        p_defect_type_id,
      'defect_description',    p_defect_description,
      'quality_block_required',p_quality_block_required,
      'quality_block_number',  p_quality_block_number,
      'opened_at',             p_opened_at
    ),
    v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────────────────
-- admin_delete_rework_lot: exclusão completa do lote e todos registros filhos
-- ──────────────────────────────────────────────────────────────────────────────
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

  -- Registra exclusão ANTES de deletar (audit sobrevive ao delete)
  INSERT INTO public.audit_log (table_name, record_id, action, old_data, user_id)
  VALUES ('rework_lots', p_lot_id::text, 'admin_delete', v_old_data, v_user_id);

  -- Remove registros dependentes na ordem correta
  DELETE FROM public.attachments       WHERE lot_id = p_lot_id;
  DELETE FROM public.quality_events    WHERE lot_id = p_lot_id;
  DELETE FROM public.scrap_events      WHERE lot_id = p_lot_id;
  DELETE FROM public.lot_stage_balances WHERE lot_id = p_lot_id;
  DELETE FROM public.lot_movements     WHERE lot_id = p_lot_id;
  DELETE FROM public.rework_lots       WHERE id     = p_lot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

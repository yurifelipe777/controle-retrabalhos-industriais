-- Migration 017: Repara lot_stage_balances + torna RPCs tolerantes a saldo faltante
--
-- Problema: lotes com quantity_open > 0 mas sem entradas em lot_stage_balances
-- causam "Saldo insuficiente" em send_to_decapagem / approve_quantity / send_to_scrap.
-- Causa: trigger trg_update_stage_balance pode não ter executado no momento da criação
-- (ex: factory_reset parcial, importação direta, ou inconsistência de migração).
--
-- Solução parte 1: reconstruir saldos a partir dos movimentos registrados.
-- Solução parte 2: nas RPCs, se não existir saldo por etapa, inicializar com
--                 quantity_open do lote antes de prosseguir.

-- ============================
-- 1. Reconstruir lot_stage_balances a partir de lot_movements
-- ============================
INSERT INTO public.lot_stage_balances (lot_id, stage_id, balance_quantity)
SELECT
  lot_id,
  stage_id,
  GREATEST(0, SUM(delta)) AS balance_quantity
FROM (
  -- Cada movimento adiciona saldo no destino
  SELECT lot_id, to_stage_id AS stage_id, quantity AS delta
  FROM public.lot_movements
  UNION ALL
  -- Cada movimento remove saldo da origem
  SELECT lot_id, from_stage_id AS stage_id, -quantity AS delta
  FROM public.lot_movements
  WHERE from_stage_id IS NOT NULL
) all_deltas
GROUP BY lot_id, stage_id
HAVING GREATEST(0, SUM(delta)) > 0
ON CONFLICT (lot_id, stage_id) DO UPDATE
  SET balance_quantity = EXCLUDED.balance_quantity,
      updated_at       = now();

-- Remove entradas com saldo zero (limpeza)
DELETE FROM public.lot_stage_balances WHERE balance_quantity = 0;


-- ============================
-- 2. send_to_decapagem — com fallback para quantity_open
-- ============================
CREATE OR REPLACE FUNCTION public.send_to_decapagem(
  p_lot_id        uuid,
  p_from_stage_id uuid,
  p_quantity      numeric,
  p_notes         text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_user_id            uuid;
  v_available          numeric;
  v_lot_open           numeric;
  v_decapagem_stage_id uuid;
  v_event_id           uuid;
  v_original_pn_id     uuid;
  v_quality_status     text;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada: apenas quality ou admin pode enviar para decapagem';
  END IF;

  SELECT quality_status, part_number_id, quantity_open
  INTO   v_quality_status, v_original_pn_id, v_lot_open
  FROM   public.rework_lots
  WHERE  id = p_lot_id;

  IF v_quality_status NOT IN ('blocked', 'in_inspection') THEN
    RAISE EXCEPTION 'Apenas lotes bloqueados ou em inspeção podem ser enviados para decapagem';
  END IF;

  SELECT id INTO v_decapagem_stage_id
  FROM   public.process_stages WHERE name = 'Decapagem Externa';

  IF v_decapagem_stage_id IS NULL THEN
    RAISE EXCEPTION 'Estágio "Decapagem Externa" não encontrado. Execute a migration 014.';
  END IF;

  SELECT balance_quantity INTO v_available
  FROM   public.lot_stage_balances
  WHERE  lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  -- Fallback: se não existe saldo por etapa, inicializa com quantity_open do lote
  IF v_available IS NULL THEN
    IF v_lot_open < p_quantity THEN
      RAISE EXCEPTION 'Saldo insuficiente. Disponível no lote: %, Solicitado: %', v_lot_open, p_quantity;
    END IF;
    INSERT INTO public.lot_stage_balances (lot_id, stage_id, balance_quantity)
    VALUES (p_lot_id, p_from_stage_id, v_lot_open)
    ON CONFLICT (lot_id, stage_id) DO UPDATE
      SET balance_quantity = v_lot_open, updated_at = now();
    v_available := v_lot_open;
  ELSIF v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %', v_available, p_quantity;
  END IF;

  -- Move o saldo para o estágio virtual "Decapagem Externa" (trigger atualiza lot_stage_balances)
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    p_lot_id, p_from_stage_id, v_decapagem_stage_id, p_quantity,
    'transfer', v_user_id,
    COALESCE(p_notes, 'Enviado para Decapagem Externa')
  );

  -- Registra o evento de decapagem
  v_event_id := gen_random_uuid();
  INSERT INTO public.decapagem_events (
    id, lot_id, quantity, from_stage_id, original_part_number_id,
    status, dispatched_at, dispatched_by, notes
  ) VALUES (
    v_event_id, p_lot_id, p_quantity, p_from_stage_id, v_original_pn_id,
    'dispatched', now(), v_user_id, p_notes
  );

  -- Atualiza status do lote
  UPDATE public.rework_lots
  SET current_status = 'awaiting_decapagem',
      quality_status = 'sent_to_decapagem',
      updated_at     = now()
  WHERE id = p_lot_id;

  INSERT INTO public.quality_events (lot_id, event_type, quantity, notes, created_by)
  VALUES (p_lot_id, 'send_to_decapagem', p_quantity, p_notes, v_user_id);

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'decapagem_events', p_lot_id, 'send_to_decapagem',
    jsonb_build_object('decapagem_event_id', v_event_id, 'quantity', p_quantity, 'from_stage_id', p_from_stage_id),
    v_user_id
  );

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================
-- 3. approve_quantity — com fallback para quantity_open
-- ============================
CREATE OR REPLACE FUNCTION public.approve_quantity(
  p_lot_id         uuid,
  p_from_stage_id  uuid,
  p_quantity       numeric,
  p_quality_document text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_available          numeric;
  v_lot_open           numeric;
  v_approved_stage_id  uuid;
  v_new_open           numeric;
  v_user_id            uuid;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT id INTO v_approved_stage_id FROM public.process_stages WHERE name = 'Aprovado';

  SELECT quantity_open INTO v_lot_open FROM public.rework_lots WHERE id = p_lot_id;

  SELECT balance_quantity INTO v_available
  FROM   public.lot_stage_balances
  WHERE  lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  -- Fallback: inicializa saldo com quantity_open se não existir por etapa
  IF v_available IS NULL THEN
    IF v_lot_open < p_quantity THEN
      RAISE EXCEPTION 'Saldo insuficiente para aprovação. Disponível no lote: %, Solicitado: %', v_lot_open, p_quantity;
    END IF;
    INSERT INTO public.lot_stage_balances (lot_id, stage_id, balance_quantity)
    VALUES (p_lot_id, p_from_stage_id, v_lot_open)
    ON CONFLICT (lot_id, stage_id) DO UPDATE
      SET balance_quantity = v_lot_open, updated_at = now();
    v_available := v_lot_open;
  ELSIF v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente para aprovação. Disponível: %, Solicitado: %', v_available, p_quantity;
  END IF;

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
      closed_at      = CASE WHEN v_new_open = 0 THEN now() ELSE NULL END
  WHERE id = p_lot_id;

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('quality_events', p_lot_id, 'approve_quantity',
    jsonb_build_object('quantity', p_quantity, 'remaining', v_new_open), v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================
-- 4. send_to_scrap — com fallback para quantity_open
-- ============================
CREATE OR REPLACE FUNCTION public.send_to_scrap(
  p_lot_id        uuid,
  p_from_stage_id uuid,
  p_quantity      numeric,
  p_reason        text
)
RETURNS void AS $$
DECLARE
  v_available     numeric;
  v_lot_open      numeric;
  v_scrap_stage_id uuid;
  v_new_open      numeric;
  v_user_id       uuid;
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

  SELECT quantity_open INTO v_lot_open FROM public.rework_lots WHERE id = p_lot_id;

  SELECT balance_quantity INTO v_available
  FROM   public.lot_stage_balances
  WHERE  lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  -- Fallback: inicializa saldo com quantity_open se não existir por etapa
  IF v_available IS NULL THEN
    IF v_lot_open < p_quantity THEN
      RAISE EXCEPTION 'Saldo insuficiente para sucata. Disponível no lote: %, Solicitado: %', v_lot_open, p_quantity;
    END IF;
    INSERT INTO public.lot_stage_balances (lot_id, stage_id, balance_quantity)
    VALUES (p_lot_id, p_from_stage_id, v_lot_open)
    ON CONFLICT (lot_id, stage_id) DO UPDATE
      SET balance_quantity = v_lot_open, updated_at = now();
    v_available := v_lot_open;
  ELSIF v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %', v_available, p_quantity;
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

-- Migration 019: Suporte a retorno parcial de decapagem
--
-- register_decapagem_return agora aceita p_quantity (opcional).
-- Quando p_quantity < event.quantity:
--   - Registra o retorno da quantidade informada (cria novo lote com p_quantity)
--   - Cria NOVO decapagem_events para o saldo restante (status='dispatched')
--   - Lote original permanece awaiting_decapagem
-- Quando p_quantity IS NULL ou = event.quantity (retorno total):
--   - Comportamento original: encerra lote, fecha evento.

CREATE OR REPLACE FUNCTION public.register_decapagem_return(
  p_decapagem_event_id uuid,
  p_returned_pn_id     uuid,
  p_initial_stage_id   uuid,
  p_defect_description text    DEFAULT NULL,
  p_return_notes       text    DEFAULT NULL,
  p_quantity           numeric DEFAULT NULL
)
RETURNS TABLE(lot_id uuid, lot_code text) AS $$
DECLARE
  v_user_id            uuid;
  v_event              public.decapagem_events;
  v_original_lot       public.rework_lots;
  v_new_lot_id         uuid;
  v_new_lot_code       text;
  v_decapagem_stage_id uuid;
  v_approved_stage_id  uuid;
  v_returned_pn        text;
  v_return_qty         numeric;
  v_remaining_qty      numeric;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT * INTO v_event FROM public.decapagem_events WHERE id = p_decapagem_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Evento de decapagem não encontrado';
  END IF;
  IF v_event.status != 'dispatched' THEN
    RAISE EXCEPTION 'Este evento de decapagem já foi processado (status: %)', v_event.status;
  END IF;

  SELECT * INTO v_original_lot FROM public.rework_lots WHERE id = v_event.lot_id;

  SELECT id INTO v_decapagem_stage_id FROM public.process_stages WHERE name = 'Decapagem Externa';
  SELECT id INTO v_approved_stage_id  FROM public.process_stages WHERE name = 'Aprovado';
  SELECT part_number INTO v_returned_pn FROM public.product_master WHERE id = p_returned_pn_id;

  -- Determina quantidade que retorna
  v_return_qty := COALESCE(p_quantity, v_event.quantity);

  IF v_return_qty <= 0 OR v_return_qty > v_event.quantity THEN
    RAISE EXCEPTION 'Quantidade inválida. Deve ser entre 1 e % pç', v_event.quantity;
  END IF;

  v_remaining_qty := v_event.quantity - v_return_qty;

  -- Move v_return_qty de "Decapagem Externa" → "Aprovado" no lote original
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    v_event.lot_id,
    v_decapagem_stage_id,
    v_approved_stage_id,
    v_return_qty,
    'transfer',
    v_user_id,
    'RETORNO DE DECAPAGEM — Quadro transformado em PN bruto: ' || v_returned_pn
  );

  -- Cria novo lote com o PN do quadro bruto
  v_new_lot_code := generate_lot_code();
  v_new_lot_id   := gen_random_uuid();

  INSERT INTO public.rework_lots (
    id, lot_code, part_number_id, quantity_initial, quantity_open,
    origin_area, current_status, quality_status,
    defect_type_id, defect_description,
    quality_block_required, quality_block_number,
    created_by, originated_from_decapagem_id
  ) VALUES (
    v_new_lot_id,
    v_new_lot_code,
    p_returned_pn_id,
    v_return_qty,
    v_return_qty,
    v_original_lot.origin_area,
    'open',
    'unblocked',
    v_original_lot.defect_type_id,
    COALESCE(
      p_defect_description,
      'Retorno de Decapagem do lote ' || v_original_lot.lot_code
    ),
    false,
    v_original_lot.quality_block_number,
    v_user_id,
    p_decapagem_event_id
  );

  -- Movimento inicial do novo lote
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    v_new_lot_id,
    NULL,
    p_initial_stage_id,
    v_return_qty,
    'initial',
    v_user_id,
    COALESCE(
      p_return_notes,
      'Quadro bruto retornado de Decapagem — Lote de origem: ' || v_original_lot.lot_code
    )
  );

  IF v_remaining_qty > 0 THEN
    -- ── RETORNO PARCIAL ─────────────────────────────────────────────

    -- Fecha evento atual com a quantidade que retornou
    UPDATE public.decapagem_events
    SET status                  = 'returned',
        quantity                = v_return_qty,
        returned_at             = now(),
        returned_by             = v_user_id,
        returned_part_number_id = p_returned_pn_id,
        returned_lot_id         = v_new_lot_id,
        return_notes            = COALESCE(
          p_return_notes,
          'Retorno parcial: ' || v_return_qty || ' pç de ' || v_event.quantity || ' pç originais'
        )
    WHERE id = p_decapagem_event_id;

    -- Cria novo evento para o saldo restante
    INSERT INTO public.decapagem_events (
      lot_id, quantity, from_stage_id, original_part_number_id,
      status, dispatched_at, dispatched_by, notes
    ) VALUES (
      v_event.lot_id,
      v_remaining_qty,
      v_event.from_stage_id,
      v_event.original_part_number_id,
      'dispatched',
      v_event.dispatched_at,
      v_event.dispatched_by,
      '[Saldo de retorno parcial — ' || v_remaining_qty || ' pç ainda aguardando]'
        || CASE WHEN v_event.notes IS NOT NULL THEN ' — ' || v_event.notes ELSE '' END
    );

    -- Lote original permanece awaiting_decapagem (não fecha)

  ELSE
    -- ── RETORNO TOTAL ────────────────────────────────────────────────

    -- Encerra lote original
    UPDATE public.rework_lots
    SET quantity_open   = 0,
        current_status  = 'closed',
        quality_status  = 'unblocked',
        closed_at       = now(),
        updated_at      = now()
    WHERE id = v_event.lot_id;

    -- Fecha evento de decapagem
    UPDATE public.decapagem_events
    SET status                  = 'returned',
        returned_at             = now(),
        returned_by             = v_user_id,
        returned_part_number_id = p_returned_pn_id,
        returned_lot_id         = v_new_lot_id,
        return_notes            = p_return_notes
    WHERE id = p_decapagem_event_id;

  END IF;

  -- Evento de qualidade no lote original
  INSERT INTO public.quality_events (lot_id, event_type, quantity, notes, created_by)
  VALUES (
    v_event.lot_id,
    'return_from_decapagem',
    v_return_qty,
    CASE
      WHEN v_remaining_qty > 0
        THEN 'Retorno parcial: ' || v_return_qty || ' pç. Saldo aguardando: ' || v_remaining_qty || ' pç. Novo lote: ' || v_new_lot_code
      ELSE
        'Retorno total. Novo lote gerado: ' || v_new_lot_code
    END,
    v_user_id
  );

  -- Audit log
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'decapagem_events', v_event.lot_id, 'register_decapagem_return',
    jsonb_build_object(
      'decapagem_event_id', p_decapagem_event_id,
      'new_lot_id',         v_new_lot_id,
      'new_lot_code',       v_new_lot_code,
      'returned_pn',        v_returned_pn,
      'return_qty',         v_return_qty,
      'remaining_qty',      v_remaining_qty
    ),
    v_user_id
  );

  RETURN QUERY SELECT v_new_lot_id, v_new_lot_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

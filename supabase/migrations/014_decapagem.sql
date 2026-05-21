-- Migration 014: Processo de Decapagem Externa
-- Rastreamento do processo de remoção química de tinta em quadros não-conformes,
-- incluindo transformação De/Para de part number (pintado → bruto).

-- ============================
-- 1. Expandir CHECK de current_status em rework_lots
-- ============================
ALTER TABLE public.rework_lots
  DROP CONSTRAINT IF EXISTS rework_lots_current_status_check;

ALTER TABLE public.rework_lots
  ADD CONSTRAINT rework_lots_current_status_check CHECK (
    current_status IN (
      'open', 'in_rework', 'awaiting_quality',
      'partially_approved', 'approved',
      'partially_scrapped', 'scrapped',
      'closed', 'cancelled',
      'awaiting_decapagem'
    )
  );

-- ============================
-- 2. Expandir CHECK de quality_status em rework_lots
-- ============================
ALTER TABLE public.rework_lots
  DROP CONSTRAINT IF EXISTS rework_lots_quality_status_check;

ALTER TABLE public.rework_lots
  ADD CONSTRAINT rework_lots_quality_status_check CHECK (
    quality_status IN (
      'pending_block', 'blocked', 'in_inspection',
      'approved', 'rejected', 'unblocked', 'scrap_approved',
      'sent_to_decapagem'
    )
  );

-- ============================
-- 3. Expandir CHECK de event_type em quality_events
-- ============================
ALTER TABLE public.quality_events
  DROP CONSTRAINT IF EXISTS quality_events_event_type_check;

ALTER TABLE public.quality_events
  ADD CONSTRAINT quality_events_event_type_check CHECK (
    event_type IN (
      'block', 'unblock', 'inspection', 'approve', 'reject',
      'send_to_scrap', 'send_to_decapagem', 'return_from_decapagem'
    )
  );

-- ============================
-- 4. Inserir estágio "Decapagem Externa"
-- ============================
INSERT INTO public.process_stages (name, sequence, active)
SELECT 'Decapagem Externa', 98, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.process_stages WHERE name = 'Decapagem Externa'
);

-- ============================
-- 5. Tabela de eventos de decapagem
-- ============================
CREATE TABLE IF NOT EXISTS public.decapagem_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                  uuid NOT NULL REFERENCES public.rework_lots(id),
  quantity                numeric NOT NULL CHECK (quantity > 0),
  from_stage_id           uuid NOT NULL REFERENCES public.process_stages(id),
  original_part_number_id uuid NOT NULL REFERENCES public.product_master(id),
  returned_part_number_id uuid REFERENCES public.product_master(id),
  status                  text NOT NULL DEFAULT 'dispatched'
                            CHECK (status IN ('dispatched', 'returned', 'cancelled')),
  dispatched_at           timestamptz NOT NULL DEFAULT now(),
  dispatched_by           uuid REFERENCES public.profiles(id),
  returned_at             timestamptz,
  returned_by             uuid REFERENCES public.profiles(id),
  returned_lot_id         uuid REFERENCES public.rework_lots(id),
  notes                   text,
  return_notes            text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decapagem_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_decapagem_events_lot_id  ON public.decapagem_events(lot_id);
CREATE INDEX IF NOT EXISTS idx_decapagem_events_status  ON public.decapagem_events(status);

-- ============================
-- 6. Coluna de rastreabilidade em rework_lots
-- ============================
ALTER TABLE public.rework_lots
  ADD COLUMN IF NOT EXISTS originated_from_decapagem_id uuid
    REFERENCES public.decapagem_events(id);

CREATE INDEX IF NOT EXISTS idx_rework_lots_originated_from
  ON public.rework_lots(originated_from_decapagem_id);

-- ============================
-- 7. RLS para decapagem_events
-- ============================
CREATE POLICY "approved_read_decapagem" ON public.decapagem_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'approved'
    )
  );

CREATE POLICY "rpc_insert_decapagem" ON public.decapagem_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "rpc_update_decapagem" ON public.decapagem_events
  FOR UPDATE USING (true);

-- ============================
-- 8. RPC: send_to_decapagem
-- ============================
CREATE OR REPLACE FUNCTION public.send_to_decapagem(
  p_lot_id       uuid,
  p_from_stage_id uuid,
  p_quantity     numeric,
  p_notes        text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_user_id            uuid;
  v_available          numeric;
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

  SELECT quality_status, part_number_id
  INTO v_quality_status, v_original_pn_id
  FROM public.rework_lots
  WHERE id = p_lot_id;

  IF v_quality_status NOT IN ('blocked', 'in_inspection') THEN
    RAISE EXCEPTION 'Apenas lotes bloqueados ou em inspeção podem ser enviados para decapagem';
  END IF;

  SELECT id INTO v_decapagem_stage_id
  FROM public.process_stages WHERE name = 'Decapagem Externa';

  IF v_decapagem_stage_id IS NULL THEN
    RAISE EXCEPTION 'Estágio "Decapagem Externa" não encontrado. Execute a migration 014.';
  END IF;

  SELECT balance_quantity INTO v_available
  FROM public.lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;

  IF COALESCE(v_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %',
      COALESCE(v_available, 0), p_quantity;
  END IF;

  -- Move o saldo para o estágio virtual "Decapagem Externa"
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

  -- Evento de qualidade
  INSERT INTO public.quality_events (lot_id, event_type, quantity, notes, created_by)
  VALUES (p_lot_id, 'send_to_decapagem', p_quantity, p_notes, v_user_id);

  -- Audit log
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'decapagem_events', p_lot_id, 'send_to_decapagem',
    jsonb_build_object(
      'decapagem_event_id', v_event_id,
      'quantity', p_quantity,
      'from_stage_id', p_from_stage_id
    ),
    v_user_id
  );

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================
-- 9. RPC: register_decapagem_return
-- Fecha o lote original e cria novo lote com o PN do quadro bruto.
-- ============================
CREATE OR REPLACE FUNCTION public.register_decapagem_return(
  p_decapagem_event_id uuid,
  p_returned_pn_id     uuid,
  p_initial_stage_id   uuid,
  p_defect_description text DEFAULT NULL,
  p_return_notes       text DEFAULT NULL
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

  -- Fecha saldo do lote original: move de "Decapagem Externa" → "Aprovado"
  -- (representa o encerramento da rastreabilidade — o quadro foi transformado)
  INSERT INTO public.lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    v_event.lot_id,
    v_decapagem_stage_id,
    v_approved_stage_id,
    v_event.quantity,
    'transfer',
    v_user_id,
    'RETORNO DE DECAPAGEM — Quadro transformado em PN bruto: ' || v_returned_pn
  );

  -- Encerra lote original
  UPDATE public.rework_lots
  SET quantity_open   = 0,
      current_status  = 'closed',
      quality_status  = 'unblocked',
      closed_at       = now(),
      updated_at      = now()
  WHERE id = v_event.lot_id;

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
    v_event.quantity,
    v_event.quantity,
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
    v_event.quantity,
    'initial',
    v_user_id,
    COALESCE(
      p_return_notes,
      'Quadro bruto retornado de Decapagem Externa — Lote de origem: ' || v_original_lot.lot_code
    )
  );

  -- Atualiza o evento de decapagem com os dados do retorno
  UPDATE public.decapagem_events
  SET status                  = 'returned',
      returned_at             = now(),
      returned_by             = v_user_id,
      returned_part_number_id = p_returned_pn_id,
      returned_lot_id         = v_new_lot_id,
      return_notes            = p_return_notes
  WHERE id = p_decapagem_event_id;

  -- Evento de qualidade no lote original
  INSERT INTO public.quality_events (lot_id, event_type, quantity, notes, created_by)
  VALUES (
    v_event.lot_id, 'return_from_decapagem', v_event.quantity,
    'Novo lote gerado: ' || v_new_lot_code, v_user_id
  );

  -- Audit log
  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'decapagem_events', v_event.lot_id, 'register_decapagem_return',
    jsonb_build_object(
      'decapagem_event_id', p_decapagem_event_id,
      'new_lot_id',         v_new_lot_id,
      'new_lot_code',       v_new_lot_code,
      'returned_pn_id',     p_returned_pn_id,
      'returned_pn',        v_returned_pn
    ),
    v_user_id
  );

  RETURN QUERY SELECT v_new_lot_id, v_new_lot_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration 018: RPC formalize_decapagem_from_balance
--
-- Caso de uso: lote cujo saldo já está em "Decapagem Externa" mas não possui
-- um decapagem_events registrado (ocorre quando o lote foi criado erroneamente
-- com "Decapagem Externa" como etapa inicial, bypassando o fluxo normal).
--
-- Esta RPC cria o evento de decapagem SEM mover saldo (já está lá) e atualiza
-- o current_status do lote para 'awaiting_decapagem', tornando-o visível na
-- página de Decapagem para que o retorno possa ser registrado normalmente.

CREATE OR REPLACE FUNCTION public.formalize_decapagem_from_balance(
  p_lot_id   uuid,
  p_quantity numeric,
  p_notes    text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_user_id            uuid;
  v_event_id           uuid;
  v_original_pn_id     uuid;
  v_quality_status     text;
  v_decapagem_stage_id uuid;
  v_available          numeric;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada: apenas quality ou admin pode formalizar decapagem';
  END IF;

  SELECT quality_status, part_number_id
  INTO   v_quality_status, v_original_pn_id
  FROM   public.rework_lots
  WHERE  id = p_lot_id;

  IF v_quality_status NOT IN ('blocked', 'in_inspection') THEN
    RAISE EXCEPTION 'Apenas lotes bloqueados ou em inspeção podem ser formalizados para decapagem';
  END IF;

  SELECT id INTO v_decapagem_stage_id
  FROM   public.process_stages WHERE name = 'Decapagem Externa';

  IF v_decapagem_stage_id IS NULL THEN
    RAISE EXCEPTION 'Estágio "Decapagem Externa" não encontrado';
  END IF;

  SELECT balance_quantity INTO v_available
  FROM   public.lot_stage_balances
  WHERE  lot_id = p_lot_id AND stage_id = v_decapagem_stage_id;

  IF COALESCE(v_available, 0) < p_quantity THEN
    RAISE EXCEPTION 'Saldo em Decapagem Externa insuficiente. Disponível: %, Solicitado: %',
      COALESCE(v_available, 0), p_quantity;
  END IF;

  v_event_id := gen_random_uuid();
  INSERT INTO public.decapagem_events (
    id, lot_id, quantity, from_stage_id, original_part_number_id,
    status, dispatched_at, dispatched_by, notes
  ) VALUES (
    v_event_id, p_lot_id, p_quantity, v_decapagem_stage_id, v_original_pn_id,
    'dispatched', now(), v_user_id,
    COALESCE(p_notes, 'Envio formalizado retroativamente — saldo já estava em Decapagem Externa')
  );

  UPDATE public.rework_lots
  SET current_status = 'awaiting_decapagem',
      quality_status = 'sent_to_decapagem',
      updated_at     = now()
  WHERE id = p_lot_id;

  INSERT INTO public.quality_events (lot_id, event_type, quantity, notes, created_by)
  VALUES (p_lot_id, 'send_to_decapagem', p_quantity, p_notes, v_user_id);

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, user_id)
  VALUES (
    'decapagem_events', p_lot_id, 'formalize_decapagem',
    jsonb_build_object('decapagem_event_id', v_event_id, 'quantity', p_quantity),
    v_user_id
  );

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

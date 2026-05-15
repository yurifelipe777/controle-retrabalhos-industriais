-- Migration 012: Estorno parcial e suporte a movimentos iniciais

-- Remove a função anterior (assinatura diferente — 2 params → 3 params)
DROP FUNCTION IF EXISTS public.reverse_lot_movement(uuid, text);

-- Nova versão: suporta quantidade parcial e movimento inicial
CREATE OR REPLACE FUNCTION public.reverse_lot_movement(
  p_movement_id uuid,
  p_reason      text,
  p_quantity    numeric DEFAULT NULL   -- NULL = estorna toda a quantidade disponível
)
RETURNS uuid AS $$
DECLARE
  v_user_id          uuid;
  v_mov              RECORD;
  v_available        numeric;
  v_already_reversed numeric;
  v_effective_qty    numeric;
  v_reversal_id      uuid;
  v_lot_status       text;
BEGIN
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo do estorno é obrigatório';
  END IF;

  -- Carrega movimento com nomes das etapas
  SELECT
    m.id, m.lot_id, m.from_stage_id, m.to_stage_id, m.quantity, m.movement_type,
    m.is_reversed, m.moved_at, m.notes AS original_notes,
    fs.name AS from_stage_name,
    ts.name AS to_stage_name
  INTO v_mov
  FROM public.lot_movements m
  LEFT JOIN public.process_stages fs ON m.from_stage_id = fs.id
  LEFT JOIN public.process_stages ts ON m.to_stage_id   = ts.id
  WHERE m.id = p_movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada';
  END IF;

  IF v_mov.movement_type NOT IN ('transfer', 'initial') THEN
    RAISE EXCEPTION 'Apenas movimentações de transferência ou entrada inicial podem ser estornadas. Tipo atual: "%"', v_mov.movement_type;
  END IF;

  -- Verifica status do lote
  SELECT current_status INTO v_lot_status
  FROM public.rework_lots WHERE id = v_mov.lot_id;

  IF v_lot_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'Lote encerrado ou cancelado — estorno não permitido';
  END IF;

  -- Calcula quanto já foi estornado deste movimento
  SELECT COALESCE(SUM(quantity), 0) INTO v_already_reversed
  FROM public.lot_movements
  WHERE reversal_of_movement_id = p_movement_id AND movement_type = 'reversal';

  -- Quantidade disponível para estorno neste movimento
  IF v_already_reversed >= v_mov.quantity THEN
    RAISE EXCEPTION 'Esta movimentação já foi totalmente estornada';
  END IF;

  -- Define a quantidade efetiva (NULL = tudo que resta)
  v_effective_qty := COALESCE(p_quantity, v_mov.quantity - v_already_reversed);

  IF v_effective_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade de estorno deve ser maior que zero';
  END IF;

  IF v_already_reversed + v_effective_qty > v_mov.quantity THEN
    RAISE EXCEPTION
      'Quantidade solicitada (%) excede o disponível para estorno: % pç',
      v_effective_qty, v_mov.quantity - v_already_reversed;
  END IF;

  -- Verifica saldo disponível na etapa de destino do movimento original (com lock)
  SELECT balance_quantity INTO v_available
  FROM public.lot_stage_balances
  WHERE lot_id = v_mov.lot_id AND stage_id = v_mov.to_stage_id
  FOR UPDATE;

  IF COALESCE(v_available, 0) < v_effective_qty THEN
    RAISE EXCEPTION
      'Saldo insuficiente para estorno. Disponível em "%": % pç, necessário: % pç.',
      v_mov.to_stage_name, COALESCE(v_available, 0), v_effective_qty;
  END IF;

  v_reversal_id := gen_random_uuid();

  IF v_mov.movement_type = 'transfer' THEN
    -- Transferência: cria movimento inverso (de to_stage → from_stage)
    -- O trigger update_stage_balance_on_movement ajusta os saldos automaticamente
    INSERT INTO public.lot_movements (
      id, lot_id, from_stage_id, to_stage_id, quantity, movement_type,
      moved_by, notes, reversal_of_movement_id
    ) VALUES (
      v_reversal_id, v_mov.lot_id,
      v_mov.to_stage_id,    -- de: onde estava o material
      v_mov.from_stage_id,  -- para: de volta à origem
      v_effective_qty, 'reversal',
      v_user_id,
      'ESTORNO: ' || p_reason,
      p_movement_id
    );

  ELSIF v_mov.movement_type = 'initial' THEN
    -- Entrada inicial: from_stage_id é NULL, não há "de volta para".
    -- Estratégia: inserir movimento com from = to = stage original.
    --   O trigger reduz o saldo e depois adiciona de volta (efeito líquido zero).
    --   Em seguida corrigimos manualmente o saldo e quantity_open.
    INSERT INTO public.lot_movements (
      id, lot_id, from_stage_id, to_stage_id, quantity, movement_type,
      moved_by, notes, reversal_of_movement_id
    ) VALUES (
      v_reversal_id, v_mov.lot_id,
      v_mov.to_stage_id,   -- from = stage da entrada (trigger vai reduzir...)
      v_mov.to_stage_id,   -- to   = mesmo stage     (...e adicionar de volta)
      v_effective_qty, 'reversal',
      v_user_id,
      'ESTORNO DE ENTRADA: ' || p_reason,
      p_movement_id
    );
    -- Trigger neteou a zero; aplicamos a redução real manualmente
    UPDATE public.lot_stage_balances
    SET balance_quantity = balance_quantity - v_effective_qty,
        updated_at = now()
    WHERE lot_id = v_mov.lot_id AND stage_id = v_mov.to_stage_id;

    -- Estorno de entrada reduz o saldo aberto do lote
    UPDATE public.rework_lots
    SET quantity_open = quantity_open - v_effective_qty,
        updated_at = now()
    WHERE id = v_mov.lot_id;
  END IF;

  -- Marca como totalmente estornado apenas quando toda a quantidade foi revertida
  IF v_already_reversed + v_effective_qty >= v_mov.quantity THEN
    UPDATE public.lot_movements
    SET is_reversed = true
    WHERE id = p_movement_id;
  END IF;

  -- Recalcula status do lote
  UPDATE public.rework_lots
  SET current_status = 'open', updated_at = now()
  WHERE id = v_mov.lot_id
    AND current_status = 'in_rework'
    AND NOT EXISTS (
      SELECT 1
      FROM public.lot_stage_balances lsb
      JOIN public.process_stages ps ON ps.id = lsb.stage_id
      WHERE lsb.lot_id = v_mov.lot_id
        AND lsb.balance_quantity > 0
        AND ps.name NOT IN ('Entrada', 'Aprovado', 'Sucata')
    );

  -- Audit log completo
  INSERT INTO public.audit_log (
    table_name, record_id, action, old_data, new_data, user_id
  ) VALUES (
    'lot_movements', v_mov.lot_id, 'reverse_movement',
    jsonb_build_object(
      'movement_id',          p_movement_id,
      'movement_type',        v_mov.movement_type,
      'from_stage',           v_mov.from_stage_name,
      'to_stage',             v_mov.to_stage_name,
      'original_quantity',    v_mov.quantity,
      'already_reversed_qty', v_already_reversed,
      'original_notes',       v_mov.original_notes,
      'original_moved_at',    v_mov.moved_at
    ),
    jsonb_build_object(
      'reversal_id',    v_reversal_id,
      'reversed_qty',   v_effective_qty,
      'reason',         p_reason,
      'partial',        v_effective_qty < v_mov.quantity
    ),
    v_user_id
  );

  RETURN v_reversal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

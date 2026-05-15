-- Migration 011: Estorno de movimentações

-- Adiciona rastreamento de estorno na tabela de movimentos
ALTER TABLE public.lot_movements
  ADD COLUMN IF NOT EXISTS is_reversed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversal_of_movement_id uuid REFERENCES public.lot_movements(id);

CREATE INDEX IF NOT EXISTS idx_lot_movements_reversal
  ON public.lot_movements(reversal_of_movement_id)
  WHERE reversal_of_movement_id IS NOT NULL;

-- ============================
-- Função RPC: estornar movimentação
-- ============================
-- Regras:
--   1. Apenas movimentos do tipo 'transfer' podem ser estornados
--   2. Movimento não pode já ter sido estornado
--   3. Deve haver saldo suficiente na etapa de destino do movimento original
--   4. Lote não pode estar encerrado ou cancelado
--   5. Cria movimento inverso com movement_type = 'reversal'
--   6. O trigger update_stage_balance_on_movement ajusta os saldos automaticamente
--   7. Gera audit_log com old_data e new_data completos

CREATE OR REPLACE FUNCTION public.reverse_lot_movement(
  p_movement_id uuid,
  p_reason text
)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_mov RECORD;
  v_available numeric;
  v_reversal_id uuid;
  v_lot_status text;
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

  -- Carrega movimento com nomes das etapas para mensagens de erro e audit
  SELECT
    m.id,
    m.lot_id,
    m.from_stage_id,
    m.to_stage_id,
    m.quantity,
    m.movement_type,
    m.is_reversed,
    m.moved_at,
    m.notes AS original_notes,
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

  IF v_mov.is_reversed THEN
    RAISE EXCEPTION 'Esta movimentação já foi estornada';
  END IF;

  -- Apenas movimentos de transferência podem ser estornados individualmente.
  -- Movimentos iniciais representam a criação do lote — para desfazê-los, cancele o lote.
  -- Movimentos de reversal e adjustment não são estornáveis.
  IF v_mov.movement_type != 'transfer' THEN
    RAISE EXCEPTION 'Apenas movimentações de transferência podem ser estornadas. Tipo atual: "%"', v_mov.movement_type;
  END IF;

  -- Verifica status do lote
  SELECT current_status INTO v_lot_status
  FROM public.rework_lots WHERE id = v_mov.lot_id;

  IF v_lot_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'Lote encerrado ou cancelado — estorno não permitido';
  END IF;

  -- Verifica saldo disponível na etapa de destino do movimento original (com lock)
  SELECT balance_quantity INTO v_available
  FROM public.lot_stage_balances
  WHERE lot_id = v_mov.lot_id AND stage_id = v_mov.to_stage_id
  FOR UPDATE;

  IF COALESCE(v_available, 0) < v_mov.quantity THEN
    RAISE EXCEPTION
      'Saldo insuficiente para estorno. Disponível em "%": % pç, necessário: % pç. '
      'Pode haver movimentações posteriores que consumiram este saldo.',
      v_mov.to_stage_name,
      COALESCE(v_available, 0),
      v_mov.quantity;
  END IF;

  v_reversal_id := gen_random_uuid();

  -- Cria movimento de estorno invertendo from/to
  -- O trigger update_stage_balance_on_movement cuida dos saldos automaticamente:
  --   - Reduz saldo em to_stage_id (= origem do reversal = destino do original)
  --   - Aumenta saldo em from_stage_id (= destino do reversal = origem do original)
  INSERT INTO public.lot_movements (
    id,
    lot_id,
    from_stage_id,
    to_stage_id,
    quantity,
    movement_type,
    moved_by,
    notes,
    reversal_of_movement_id
  ) VALUES (
    v_reversal_id,
    v_mov.lot_id,
    v_mov.to_stage_id,    -- de: etapa de destino do movimento original
    v_mov.from_stage_id,  -- para: etapa de origem do movimento original
    v_mov.quantity,
    'reversal',
    v_user_id,
    'ESTORNO: ' || p_reason,
    p_movement_id
  );

  -- Marca movimento original como estornado
  UPDATE public.lot_movements
  SET is_reversed = true
  WHERE id = p_movement_id;

  -- Recalcula status do lote:
  -- Se não há mais saldo em etapas operacionais (exceto Entrada, Aprovado, Sucata),
  -- volta para 'open'; caso contrário permanece 'in_rework'
  UPDATE public.rework_lots
  SET current_status = 'open',
      updated_at = now()
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

  -- Audit log completo para rastreabilidade
  INSERT INTO public.audit_log (
    table_name, record_id, action, old_data, new_data, user_id
  ) VALUES (
    'lot_movements',
    v_mov.lot_id,
    'reverse_movement',
    jsonb_build_object(
      'movement_id',       p_movement_id,
      'from_stage',        v_mov.from_stage_name,
      'to_stage',          v_mov.to_stage_name,
      'quantity',          v_mov.quantity,
      'original_notes',    v_mov.original_notes,
      'original_moved_at', v_mov.moved_at
    ),
    jsonb_build_object(
      'reversal_id', v_reversal_id,
      'reason',      p_reason
    ),
    v_user_id
  );

  RETURN v_reversal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

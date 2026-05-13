# POP-03: Fluxo do Lote de Retrabalho
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever o ciclo de vida completo de um lote de retrabalho, desde a abertura até o encerramento.

## Estados do Lote

```
          ┌─────────────────────┐
          │       open          │ ← Criado, saldo em Entrada
          └─────────┬───────────┘
                    │ movimentação
                    ▼
          ┌─────────────────────┐
          │     in_rework       │ ← Saldo em etapa operacional
          └─────────┬───────────┘
                    │ envio para Qualidade
                    ▼
          ┌─────────────────────┐
          │  awaiting_quality   │ ← Saldo em Qualidade
          └─────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐     ┌─────────────────────┐
│   approved    │     │  partially_approved  │
│  (100% aprov) │     │  (parte aprovada)    │
└───────┬───────┘     └──────────┬──────────┘
        │                        │ resto sucata/reprova
        └───────────┬────────────┘
                    │ quantity_open = 0
                    ▼
          ┌─────────────────────┐
          │       closed        │ ← Encerrado (destino final)
          └─────────────────────┘

     ┌─────────────────────┐
     │      cancelled      │ ← Admin com justificativa
     └─────────────────────┘
```

## Função: create_rework_lot

### Entrada
```typescript
{
  part_number_id: string (uuid)
  quantity_initial: number
  origin_area: string
  initial_stage_id: string (uuid) // etapa "Entrada"
  defect_type_id: string (uuid)
  defect_description: string
  quality_block_required: boolean
  quality_block_number?: string
  notes?: string
}
```

### Saída
```typescript
{
  lot_id: string (uuid)
  lot_code: string // RT-AAAAMMDD-0001
}
```

### Lógica
```sql
CREATE OR REPLACE FUNCTION create_rework_lot(
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
  v_lot_code := generate_lot_code();
  v_lot_id := gen_random_uuid();
  
  -- 1. Criar lote
  INSERT INTO rework_lots (
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
  
  -- 2. Criar movimento inicial
  INSERT INTO lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    v_lot_id, NULL, p_initial_stage_id, p_quantity_initial, 'initial', v_user_id, p_notes
  );
  -- Trigger atualiza lot_stage_balances automaticamente
  
  -- 3. Audit log
  INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('rework_lots', v_lot_id, 'create_lot',
    jsonb_build_object('lot_code', v_lot_code, 'quantity', p_quantity_initial),
    v_user_id);
  
  RETURN QUERY SELECT v_lot_id, v_lot_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Função: move_lot_quantity

### Lógica
```sql
CREATE OR REPLACE FUNCTION move_lot_quantity(
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
BEGIN
  v_user_id := auth.uid();
  
  -- 1. Verificar saldo disponível
  SELECT balance_quantity INTO v_available
  FROM lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE; -- Lock para evitar race condition
  
  IF v_available IS NULL OR v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %', 
      COALESCE(v_available, 0), p_quantity;
  END IF;
  
  -- 2. Criar movimento (trigger atualiza saldos)
  INSERT INTO lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    p_lot_id, p_from_stage_id, p_to_stage_id, p_quantity, 'transfer', v_user_id, p_notes
  );
  
  -- 3. Atualizar status do lote
  UPDATE rework_lots
  SET current_status = 'in_rework', updated_at = now()
  WHERE id = p_lot_id AND current_status = 'open';
  
  -- 4. Audit log
  INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('lot_movements', p_lot_id, 'move_quantity',
    jsonb_build_object(
      'from_stage', p_from_stage_id,
      'to_stage', p_to_stage_id,
      'quantity', p_quantity
    ), v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Função: close_lot

```sql
CREATE OR REPLACE FUNCTION close_lot(p_lot_id uuid)
RETURNS void AS $$
DECLARE
  v_open numeric;
BEGIN
  SELECT quantity_open INTO v_open FROM rework_lots WHERE id = p_lot_id;
  
  IF v_open > 0 THEN
    RAISE EXCEPTION 'Lote não pode ser encerrado: ainda há % peças em aberto', v_open;
  END IF;
  
  UPDATE rework_lots
  SET current_status = 'closed', closed_at = now(), updated_at = now()
  WHERE id = p_lot_id;
  
  INSERT INTO audit_log (table_name, record_id, action, user_id)
  VALUES ('rework_lots', p_lot_id, 'close_lot', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Casos de Borda

| Situação | Comportamento |
|---|---|
| Movimentar mais que saldo | Erro: "Saldo insuficiente" |
| Encerrar com saldo > 0 | Erro: "Ainda há X peças em aberto" |
| Part number inativo | Erro no frontend antes de criar |
| Quantidade inicial = 0 | Check constraint no banco |
| Movimento com destino = origem | Validação no frontend + check na RPC |
| Lote cancelado | Apenas admin, com justificativa obrigatória |

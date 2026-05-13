# POP-05: Fluxo de Sucata
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever o processo de envio de peças para sucata, com rastreabilidade e motivo obrigatório.

## Função: send_to_scrap

```sql
CREATE OR REPLACE FUNCTION send_to_scrap(
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
BEGIN
  -- Verificar permissão
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada: apenas quality ou admin pode enviar para sucata';
  END IF;
  
  -- Motivo obrigatório
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Motivo de sucata é obrigatório';
  END IF;
  
  -- Buscar etapa Sucata
  SELECT id INTO v_scrap_stage_id FROM process_stages WHERE name = 'Sucata';
  
  -- Verificar saldo com lock
  SELECT balance_quantity INTO v_available
  FROM lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;
  
  IF v_available IS NULL OR v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %',
      COALESCE(v_available, 0), p_quantity;
  END IF;
  
  -- Criar movimento para Sucata (trigger atualiza saldo)
  INSERT INTO lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    p_lot_id, p_from_stage_id, v_scrap_stage_id, p_quantity, 'transfer', auth.uid(), p_reason
  );
  
  -- Registrar quality_event de sucata
  INSERT INTO quality_events (
    lot_id, event_type, quantity, result, notes, created_by
  ) VALUES (
    p_lot_id, 'send_to_scrap', p_quantity, 'scrap', p_reason, auth.uid()
  );
  
  -- Registrar scrap_event
  INSERT INTO scrap_events (lot_id, quantity, reason, approved_by)
  VALUES (p_lot_id, p_quantity, p_reason, auth.uid());
  
  -- Reduzir quantity_open
  UPDATE rework_lots
  SET quantity_open = quantity_open - p_quantity,
      updated_at = now()
  WHERE id = p_lot_id;
  
  -- Verificar novo status
  SELECT quantity_open INTO v_new_open FROM rework_lots WHERE id = p_lot_id;
  
  UPDATE rework_lots
  SET current_status = CASE
    WHEN v_new_open = 0 THEN 'scrapped'
    ELSE 'partially_scrapped'
  END,
  quality_status = 'scrap_approved'
  WHERE id = p_lot_id;
  
  -- Audit log
  INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('scrap_events', p_lot_id, 'send_to_scrap',
    jsonb_build_object('quantity', p_quantity, 'reason', p_reason), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Tela de Sucata

### Campos obrigatórios
1. Lote (busca por código ou part number)
2. Etapa de origem (apenas etapas com saldo > 0)
3. Quantidade (máximo = saldo disponível)
4. Motivo da sucata (texto livre obrigatório)

### Visualização antes de confirmar
- Mostrar saldo atual por etapa
- Mostrar quantidade selecionada
- Mostrar preview do status após sucata
- Botão de confirmação com destaque vermelho

### Histórico de Sucata
- Tabela com todos os scrap_events
- Filtros: lote, part number, data, aprovador
- Exportação (CSV) disponível para admin

## Regras de Negócio

1. Motivo é obrigatório — sem exceções
2. Apenas quality ou admin pode registrar sucata
3. Sucata é irreversível — documentada em audit_log
4. Não há "estorno de sucata" — se houver erro, admin registra ajuste com justificativa
5. Sucata parcial → status `partially_scrapped`
6. Sucata total (quantity_open = 0) → status `scrapped`
7. Lote com sucata total pode ser encerrado (quantity_open = 0)

## Taxa de Sucata no Dashboard

```
taxa_sucata = (total_sucateado / total_inicial) × 100
```

Exibir por:
- Part number (top 10 com maior taxa)
- Família
- Período (mês, trimestre)
- Setor de origem

## Casos de Borda

| Situação | Comportamento |
|---|---|
| Sucata maior que saldo | Erro: saldo insuficiente |
| Motivo vazio | Erro: motivo obrigatório |
| Lote encerrado/cancelado | Erro: operação inválida |
| Usuário sem permissão | Erro 403 |
| Sucata de 100% sem bloqueio formal | Permitido — registra alerta de processo sem bloqueio formal |

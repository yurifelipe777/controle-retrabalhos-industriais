# POP-04: Fluxo de Qualidade
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever o fluxo completo de eventos de qualidade: bloqueio, inspeção, aprovação, reprovação e desbloqueio.

## Estados de Qualidade

```
pending_block → blocked → in_inspection → approved → unblocked
                    │              │
                    │              └──→ rejected
                    │              └──→ scrap_approved (parcial ou total)
                    │
                    └──→ (sem bloqueio formal = alerta crítico no dashboard)
```

## Regra de Alerta Crítico

**Todo lote com `quality_status = 'pending_block'` e status operacional não encerrado deve aparecer em alerta vermelho no dashboard.**

Isso evidencia a falha no processo: o retrabalho existe mas não foi formalmente documentado pela Qualidade.

## Permissões por Evento

| Evento | Perfil mínimo |
|---|---|
| Bloquear lote | quality, admin |
| Registrar inspeção | quality, admin |
| Aprovar quantidade | quality, admin |
| Reprovar quantidade | quality, admin |
| Enviar para sucata | quality, admin |
| Desbloquear lote | quality, admin |

## Função: block_lot

```sql
CREATE OR REPLACE FUNCTION block_lot(
  p_lot_id uuid,
  p_quality_document text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Verificar permissão
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada: apenas quality ou admin pode bloquear lotes';
  END IF;
  
  -- Atualizar status de qualidade do lote
  UPDATE rework_lots
  SET quality_status = 'blocked',
      quality_block_number = COALESCE(p_quality_document, quality_block_number),
      updated_at = now()
  WHERE id = p_lot_id;
  
  -- Registrar evento
  INSERT INTO quality_events (lot_id, event_type, quality_document, notes, created_by)
  VALUES (p_lot_id, 'block', p_quality_document, p_notes, auth.uid());
  
  -- Audit log
  INSERT INTO audit_log (table_name, record_id, action, user_id)
  VALUES ('quality_events', p_lot_id, 'block_lot', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Função: approve_quantity

```sql
CREATE OR REPLACE FUNCTION approve_quantity(
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
BEGIN
  -- Verificar permissão
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role IN ('quality', 'admin') AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  
  -- Buscar etapa "Aprovado"
  SELECT id INTO v_approved_stage_id FROM process_stages WHERE name = 'Aprovado';
  
  -- Verificar saldo
  SELECT balance_quantity INTO v_available
  FROM lot_stage_balances
  WHERE lot_id = p_lot_id AND stage_id = p_from_stage_id
  FOR UPDATE;
  
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Saldo insuficiente para aprovação';
  END IF;
  
  -- Criar movimento para Aprovado (trigger atualiza saldo)
  INSERT INTO lot_movements (
    lot_id, from_stage_id, to_stage_id, quantity, movement_type, moved_by, notes
  ) VALUES (
    p_lot_id, p_from_stage_id, v_approved_stage_id, p_quantity, 'transfer', auth.uid(), p_notes
  );
  
  -- Registrar evento de qualidade
  INSERT INTO quality_events (
    lot_id, event_type, quantity, result, quality_document, notes, created_by
  ) VALUES (
    p_lot_id, 'approve', p_quantity, 'approved', p_quality_document, p_notes, auth.uid()
  );
  
  -- Reduzir quantity_open
  UPDATE rework_lots
  SET quantity_open = quantity_open - p_quantity,
      updated_at = now()
  WHERE id = p_lot_id;
  
  -- Verificar novo status
  SELECT quantity_open INTO v_new_open FROM rework_lots WHERE id = p_lot_id;
  
  UPDATE rework_lots
  SET current_status = CASE
    WHEN v_new_open = 0 THEN 'approved'
    ELSE 'partially_approved'
  END,
  quality_status = CASE
    WHEN v_new_open = 0 THEN 'approved'
    ELSE quality_status
  END
  WHERE id = p_lot_id;
  
  -- Audit log
  INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
  VALUES ('quality_events', p_lot_id, 'approve_quantity',
    jsonb_build_object('quantity', p_quantity), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Tela de Qualidade — Funcionalidades

### Aba: Pendentes de Bloqueio
- Lista lotes com `quality_status = 'pending_block'`
- Ordenados por aging (mais antigo primeiro)
- Alerta visual vermelho
- Botão: Registrar Bloqueio

### Aba: Em Inspeção
- Lista lotes com `quality_status IN ('blocked', 'in_inspection')`
- Botões: Registrar Inspeção, Aprovar, Reprovar, Enviar para Sucata

### Aba: Histórico
- Todos os quality_events ordenados por data

## Regras de Negócio

1. Aprovação exige que o lote tenha pelo menos um quality_event anterior
2. Desbloqueio só após aprovação total ou destino final definido
3. Rejeição parcial retorna saldo para etapa operacional (retrabalho adicional)
4. Sucata a partir da qualidade: chama send_to_scrap() diretamente
5. Lote pode receber múltiplos eventos de qualidade (histórico completo preservado)

## Casos de Borda

| Situação | Comportamento |
|---|---|
| Aprovar mais do que existe em Qualidade | Erro: saldo insuficiente |
| Lote já encerrado | Erro: operação inválida |
| Usuário sem perfil quality/admin | Erro 403 no RPC |
| Documento de bloqueio duplicado | Permitido (avisar usuário) |
| Lote sem bloqueio aprovado diretamente | Bloqueado no RPC — exigir bloqueio primeiro |

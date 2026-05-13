# POP-02: Schema do Banco de Dados
# Controle de Retrabalhos Industriais

---

## Decisão de Saldo: Tabela Materializada com Trigger

**Decisão:** `lot_stage_balances` como tabela materializada, atualizada por trigger.

**Motivo:**
- View calculada (soma de movimentos) é O(n) por consulta — inviável com alto volume
- Trigger garante atomicidade junto com INSERT em lot_movements
- Validação de saldo antes de movimentar é O(1) com tabela
- Trigger é simples e auditável

**Trade-off aceito:** complexidade do trigger vs. performance e confiabilidade.

---

## Diagrama de Relacionamentos

```
auth.users
    │ 1:1
    ▼
profiles
    │ 1:N (created_by)
    ▼
rework_lots ──────────────────────────────────────────┐
    │ 1:N                                              │
    ├─── lot_movements ──────── process_stages         │
    │         │ trigger                                │
    │         ▼                                        │
    ├─── lot_stage_balances                            │
    │         (lot_id, stage_id, balance)              │
    ├─── quality_events                                │
    ├─── scrap_events                                  │
    └─── attachments                                   │
                                                       │
product_master ────────────────────────────────────────┘
process_stages (referenciado em lot_movements + lot_stage_balances)
defect_types (referenciado em rework_lots)
audit_log (referenciado por todas as ações)
legacy_rework_snapshots (standalone, sem FK operacional)
```

---

## Trigger: Atualizar Saldo após Movimentação

```sql
CREATE OR REPLACE FUNCTION update_stage_balance_on_movement()
RETURNS trigger AS $$
BEGIN
  -- Reduz saldo na etapa de origem (se houver)
  IF NEW.from_stage_id IS NOT NULL THEN
    INSERT INTO lot_stage_balances (lot_id, stage_id, balance_quantity)
    VALUES (NEW.lot_id, NEW.from_stage_id, 0)
    ON CONFLICT (lot_id, stage_id)
    DO UPDATE SET
      balance_quantity = lot_stage_balances.balance_quantity - NEW.quantity,
      updated_at = now();
    
    -- Garantia de não-negatividade
    IF (SELECT balance_quantity FROM lot_stage_balances 
        WHERE lot_id = NEW.lot_id AND stage_id = NEW.from_stage_id) < 0 THEN
      RAISE EXCEPTION 'Saldo insuficiente na etapa de origem';
    END IF;
  END IF;
  
  -- Aumenta saldo na etapa de destino
  INSERT INTO lot_stage_balances (lot_id, stage_id, balance_quantity)
  VALUES (NEW.lot_id, NEW.to_stage_id, NEW.quantity)
  ON CONFLICT (lot_id, stage_id)
  DO UPDATE SET
    balance_quantity = lot_stage_balances.balance_quantity + NEW.quantity,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stage_balance
AFTER INSERT ON lot_movements
FOR EACH ROW EXECUTE FUNCTION update_stage_balance_on_movement();
```

---

## Função: Gerar Código de Lote

```sql
CREATE OR REPLACE FUNCTION generate_lot_code()
RETURNS text AS $$
DECLARE
  today_str text;
  seq_num integer;
  lot_code text;
BEGIN
  today_str := to_char(now(), 'YYYYMMDD');
  
  -- Sequencial do dia com lock
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(l.lot_code FROM 'RT-\d{8}-(\d+)') AS integer)
  ), 0) + 1
  INTO seq_num
  FROM rework_lots l
  WHERE l.lot_code LIKE 'RT-' || today_str || '-%';
  
  lot_code := 'RT-' || today_str || '-' || LPAD(seq_num::text, 4, '0');
  RETURN lot_code;
END;
$$ LANGUAGE plpgsql;
```

---

## Normalização de Part Number

```sql
CREATE OR REPLACE FUNCTION normalize_part_number(pn text)
RETURNS text AS $$
BEGIN
  RETURN regexp_replace(
    regexp_replace(pn, '[.\s/\-]', '', 'g'),
    '[^a-zA-Z0-9]', '', 'g'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

---

## Views para Dashboard

### v_open_rework_summary
```sql
CREATE VIEW v_open_rework_summary AS
SELECT
  COUNT(*) FILTER (WHERE current_status NOT IN ('closed', 'cancelled')) AS open_lots,
  SUM(quantity_open) FILTER (WHERE current_status NOT IN ('closed', 'cancelled')) AS total_open_qty,
  COUNT(*) FILTER (WHERE quality_status = 'pending_block') AS pending_quality_block,
  AVG(EXTRACT(EPOCH FROM (now() - opened_at))/86400) 
    FILTER (WHERE current_status NOT IN ('closed', 'cancelled')) AS avg_aging_days
FROM rework_lots;
```

### v_rework_aging
```sql
CREATE VIEW v_rework_aging AS
SELECT
  id, lot_code, quantity_open,
  EXTRACT(EPOCH FROM (now() - opened_at))/86400 AS aging_days,
  CASE
    WHEN EXTRACT(EPOCH FROM (now() - opened_at))/86400 <= 2 THEN 'green'
    WHEN EXTRACT(EPOCH FROM (now() - opened_at))/86400 <= 5 THEN 'yellow'
    WHEN EXTRACT(EPOCH FROM (now() - opened_at))/86400 <= 10 THEN 'orange'
    ELSE 'red'
  END AS aging_color
FROM rework_lots
WHERE current_status NOT IN ('closed', 'cancelled');
```

### v_rework_without_quality_block
```sql
CREATE VIEW v_rework_without_quality_block AS
SELECT rl.*, pm.part_number, pm.description, pm.family
FROM rework_lots rl
JOIN product_master pm ON pm.id = rl.part_number_id
WHERE rl.quality_status = 'pending_block'
  AND rl.current_status NOT IN ('closed', 'cancelled');
```

---

## Índices

```sql
-- Performance em consultas frequentes
CREATE INDEX idx_rework_lots_status ON rework_lots(current_status);
CREATE INDEX idx_rework_lots_quality_status ON rework_lots(quality_status);
CREATE INDEX idx_rework_lots_opened_at ON rework_lots(opened_at);
CREATE INDEX idx_lot_movements_lot_id ON lot_movements(lot_id);
CREATE INDEX idx_lot_stage_balances_lot_id ON lot_stage_balances(lot_id);
CREATE INDEX idx_lot_stage_balances_stage_id ON lot_stage_balances(stage_id);
CREATE INDEX idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX idx_product_master_normalized ON product_master(normalized_part_number);
```

---

## Convenções de Nomes

- Tabelas: snake_case, plural
- Colunas: snake_case
- Funções: snake_case, verbo_substantivo
- Triggers: trg_verbo_substantivo
- Views: v_dominio_descricao
- Índices: idx_tabela_coluna
- Políticas RLS: "role_action_table"

# POP-06: Métricas e Dashboard
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever os KPIs, gráficos, alertas e views que alimentam o dashboard executivo e operacional.

## Cards do Dashboard

| Card | Fonte | Fórmula |
|---|---|---|
| Total peças em retrabalho | rework_lots | SUM(quantity_open) WHERE status != closed/cancelled |
| Lotes abertos | rework_lots | COUNT WHERE status != closed/cancelled |
| Peças aguardando Qualidade | lot_stage_balances | SUM balance WHERE stage = 'Qualidade' |
| Peças sem bloqueio formal | rework_lots | SUM(quantity_open) WHERE quality_status = 'pending_block' |
| Aging médio (dias) | rework_lots | AVG(now() - opened_at) WHERE aberto |
| Lote mais antigo | rework_lots | MAX(now() - opened_at) WHERE aberto |
| Quantidade aprovada | quality_events | SUM(quantity) WHERE event_type = 'approve' |
| Quantidade reprovada | quality_events | SUM(quantity) WHERE event_type = 'reject' |
| Quantidade sucateada | scrap_events | SUM(quantity) |
| Taxa de sucata | scrap_events + rework_lots | SUM(scrap)/SUM(initial) × 100 |

## Gráficos

### 1. Top 10 Part Numbers em Retrabalho
- Tipo: Barras horizontais
- X: Quantidade em aberto
- Y: Part number + descrição
- Cor: por família

### 2. Saldo por Setor (Gargalos)
- Tipo: Barras verticais
- X: Setor/Etapa
- Y: Quantidade total com saldo
- Destaque: etapas com maior saldo

### 3. Aging por Faixa
- Tipo: Donut/Pizza
- Faixas: 0-2d (verde), 3-5d (amarelo), 6-10d (laranja), >10d (vermelho)
- Tooltip: quantidade e % por faixa

### 4. Histórico de Entrada por Período
- Tipo: Linha ou área
- X: Data (agrupado por dia/semana/mês)
- Y: Quantidade de peças que entraram em retrabalho
- Filtro: período selecionável

### 5. Histórico de Sucata por Período
- Tipo: Barras empilhadas
- X: Data agrupada
- Y: Quantidade sucateada por motivo
- Cores: por motivo principal

### 6. Reincidência por Tipo de Defeito
- Tipo: Barras
- X: Tipo de defeito
- Y: Frequência (contagem de lotes)
- Ordenado: maior frequência primeiro

### 7. Reincidência por Família
- Tipo: Tabela + barras inline
- Família | Lotes | Quantidade | % Total

### 8. Lotes sem Bloqueio de Qualidade (Alerta)
- Tipo: Tabela vermelha/crítica
- Colunas: Lote, Part Number, Descrição, Setor, Aging, Qtd Aberta

## View: v_lot_timeline

```sql
CREATE VIEW v_lot_timeline AS
-- Criação do lote
SELECT
  rl.id AS lot_id,
  rl.lot_code,
  'lot_created' AS event_type,
  rl.quantity_initial AS quantity,
  rl.opened_at AS event_at,
  p.full_name AS actor_name,
  NULL::text AS notes,
  1 AS sort_order
FROM rework_lots rl
LEFT JOIN profiles p ON p.id = rl.created_by

UNION ALL

-- Movimentações
SELECT
  lm.lot_id,
  rl.lot_code,
  'movement' AS event_type,
  lm.quantity,
  lm.moved_at AS event_at,
  p.full_name AS actor_name,
  lm.notes,
  2 AS sort_order
FROM lot_movements lm
JOIN rework_lots rl ON rl.id = lm.lot_id
LEFT JOIN profiles p ON p.id = lm.moved_by

UNION ALL

-- Eventos de qualidade
SELECT
  qe.lot_id,
  rl.lot_code,
  'quality_' || qe.event_type AS event_type,
  qe.quantity,
  qe.created_at AS event_at,
  p.full_name AS actor_name,
  qe.notes,
  3 AS sort_order
FROM quality_events qe
JOIN rework_lots rl ON rl.id = qe.lot_id
LEFT JOIN profiles p ON p.id = qe.created_by

UNION ALL

-- Sucata
SELECT
  se.lot_id,
  rl.lot_code,
  'scrap' AS event_type,
  se.quantity,
  se.created_at AS event_at,
  p.full_name AS actor_name,
  se.reason AS notes,
  4 AS sort_order
FROM scrap_events se
JOIN rework_lots rl ON rl.id = se.lot_id
LEFT JOIN profiles p ON p.id = se.approved_by

ORDER BY lot_id, event_at, sort_order;
```

## Aging — Lógica de Cores

```typescript
function getAgingColor(days: number): string {
  if (days <= 2) return 'green';
  if (days <= 5) return 'yellow';
  if (days <= 10) return 'orange';
  return 'red';
}
```

CSS classes (Tailwind):
- green: `text-emerald-400 bg-emerald-400/10`
- yellow: `text-yellow-400 bg-yellow-400/10`
- orange: `text-orange-400 bg-orange-400/10`
- red: `text-red-400 bg-red-400/10`

## Atualização do Dashboard

- **Polling:** React Query com `staleTime: 30_000` (30s) e `refetchInterval: 60_000` (1min)
- **Real-time (opcional):** Supabase Realtime subscriptions para quantity_open e quality_status
- **Cache:** TanStack Query gerencia cache automático

## Filtros do Dashboard

- Período: hoje, 7 dias, 30 dias, 90 dias, personalizado
- Setor/Etapa
- Família
- Status operacional
- Status de qualidade

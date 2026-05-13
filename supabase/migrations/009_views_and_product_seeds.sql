-- Migration 009: Views para dashboard e seeds de product_master

-- ============================
-- VIEWS
-- ============================

-- Aging por lote
CREATE OR REPLACE VIEW public.v_rework_aging AS
SELECT
  rl.id,
  rl.lot_code,
  rl.quantity_open,
  rl.current_status,
  rl.quality_status,
  rl.opened_at,
  EXTRACT(EPOCH FROM (now() - rl.opened_at))/86400 AS aging_days,
  CASE
    WHEN EXTRACT(EPOCH FROM (now() - rl.opened_at))/86400 <= 2 THEN 'green'
    WHEN EXTRACT(EPOCH FROM (now() - rl.opened_at))/86400 <= 5 THEN 'yellow'
    WHEN EXTRACT(EPOCH FROM (now() - rl.opened_at))/86400 <= 10 THEN 'orange'
    ELSE 'red'
  END AS aging_color,
  pm.part_number,
  pm.description,
  pm.family
FROM public.rework_lots rl
JOIN public.product_master pm ON pm.id = rl.part_number_id
WHERE rl.current_status NOT IN ('closed', 'cancelled');

-- Lotes sem bloqueio formal de qualidade
CREATE OR REPLACE VIEW public.v_rework_without_quality_block AS
SELECT
  rl.id, rl.lot_code, rl.quantity_open, rl.opened_at, rl.current_status, rl.origin_area,
  EXTRACT(EPOCH FROM (now() - rl.opened_at))/86400 AS aging_days,
  pm.part_number, pm.description, pm.family
FROM public.rework_lots rl
JOIN public.product_master pm ON pm.id = rl.part_number_id
WHERE rl.quality_status = 'pending_block'
  AND rl.current_status NOT IN ('closed', 'cancelled')
ORDER BY rl.opened_at ASC;

-- Saldo por setor
CREATE OR REPLACE VIEW public.v_rework_by_stage AS
SELECT
  ps.name AS stage_name,
  ps.sequence,
  SUM(lsb.balance_quantity) AS total_balance,
  COUNT(DISTINCT lsb.lot_id) AS lot_count
FROM public.lot_stage_balances lsb
JOIN public.process_stages ps ON ps.id = lsb.stage_id
JOIN public.rework_lots rl ON rl.id = lsb.lot_id
WHERE lsb.balance_quantity > 0
  AND rl.current_status NOT IN ('closed', 'cancelled')
  AND ps.name NOT IN ('Aprovado', 'Sucata')
GROUP BY ps.name, ps.sequence
ORDER BY total_balance DESC;

-- Top part numbers em retrabalho
CREATE OR REPLACE VIEW public.v_rework_by_part_number AS
SELECT
  pm.part_number,
  pm.description,
  pm.family,
  COUNT(DISTINCT rl.id) AS lot_count,
  SUM(rl.quantity_open) AS total_open,
  SUM(rl.quantity_initial) AS total_initial
FROM public.rework_lots rl
JOIN public.product_master pm ON pm.id = rl.part_number_id
WHERE rl.current_status NOT IN ('closed', 'cancelled')
GROUP BY pm.part_number, pm.description, pm.family
ORDER BY total_open DESC;

-- Resumo de sucata
CREATE OR REPLACE VIEW public.v_scrap_summary AS
SELECT
  pm.part_number,
  pm.description,
  pm.family,
  SUM(se.quantity) AS total_scrapped,
  COUNT(DISTINCT se.lot_id) AS lot_count,
  MAX(se.created_at) AS last_scrap_at
FROM public.scrap_events se
JOIN public.rework_lots rl ON rl.id = se.lot_id
JOIN public.product_master pm ON pm.id = rl.part_number_id
GROUP BY pm.part_number, pm.description, pm.family
ORDER BY total_scrapped DESC;

-- Timeline do lote
CREATE OR REPLACE VIEW public.v_lot_timeline AS
SELECT rl.id AS lot_id, rl.lot_code, 'lot_created' AS event_type,
  rl.quantity_initial AS quantity, rl.opened_at AS event_at,
  p.full_name AS actor_name, NULL::text AS notes, 1 AS sort_order
FROM public.rework_lots rl
LEFT JOIN public.profiles p ON p.id = rl.created_by

UNION ALL

SELECT lm.lot_id, rl.lot_code, 'movement' AS event_type,
  lm.quantity, lm.moved_at AS event_at,
  p.full_name AS actor_name, lm.notes, 2 AS sort_order
FROM public.lot_movements lm
JOIN public.rework_lots rl ON rl.id = lm.lot_id
LEFT JOIN public.profiles p ON p.id = lm.moved_by

UNION ALL

SELECT qe.lot_id, rl.lot_code, 'quality_' || qe.event_type AS event_type,
  qe.quantity, qe.created_at AS event_at,
  p.full_name AS actor_name, qe.notes, 3 AS sort_order
FROM public.quality_events qe
JOIN public.rework_lots rl ON rl.id = qe.lot_id
LEFT JOIN public.profiles p ON p.id = qe.created_by

UNION ALL

SELECT se.lot_id, rl.lot_code, 'scrap' AS event_type,
  se.quantity, se.created_at AS event_at,
  p.full_name AS actor_name, se.reason AS notes, 4 AS sort_order
FROM public.scrap_events se
JOIN public.rework_lots rl ON rl.id = se.lot_id
LEFT JOIN public.profiles p ON p.id = se.approved_by;

-- ============================
-- SEEDS: product_master (da planilha)
-- ============================
INSERT INTO public.product_master (part_number, normalized_part_number, description, family) VALUES
('011507.10017', '01150710017', 'QUADRO ALUM.CALOI 10 BTO A5', 'ALUMINIO ESPECIAL'),
('011689.10019', '01168910019', 'QUADRO ALUM.WILD 13POL BTO', 'ALUMINIO ESPECIAL'),
('012068.10018', '01206810018', 'QUADRO MAX FRONT ARO 24 BRUTO A11', 'LINHA AÇO'),
('012075.10015', '01207510015', 'QUADRO PLAT CECI 24 BRUTO A11', 'LINHA AÇO'),
('012079.10019', '01207910019', 'QUADRO ALUM. WILD XS BRUTO A11', 'ALUMINIO ESPECIAL'),
('012085.10005', '01208510005', 'QUADRO ACO ANDES PLAT BTO A12', 'LINHA AÇO'),
('012336.10006', '01233610006', 'QUADRO HOT WHEELS 20 BTO 7V V-BRAKE A14', 'LINHA AÇO'),
('012367.10347', '01236710347', 'QUADRO ALU 50 PRETO CALOI 10 A13', 'ALUMINIO ESPECIAL'),
('012368.10068', '01236810068', 'QUADRO ALU 50 TRATADO CALOI 10 A13', 'ALUMINIO ESPECIAL'),
('012542.10002', '01254210002', 'QUADRO SCHWINN MADISON R26 T16 BRUTO A14', 'ALUMINIO ESPECIAL'),
('012542.10062', '01254210062', 'QUADRO SCHWINN MADISON R26 T16 TRATADO', 'ALUMINIO ESPECIAL'),
('012682.10002', '01268210002', 'QUADRO ALU. EXPLORER T17 BTO A15', 'ALUMINIO ESPECIAL'),
('012683.10003', '01268310003', 'QUADRO ALU. EXPLORER T17 TRATADO A15', 'ALUMINIO ESPECIAL'),
('013029.10009', '01302910009', 'QUADRO EXPERT R20 VBRAKE BRUTO A16', 'LINHA AÇO'),
('013709.10009', '01370910009', 'QUADRO AL T17 BTO MIDAS A19', 'ALUMINIO ESPECIAL'),
('013710.10000', '01371010000', 'QUADRO AL T17 TRATADO MIDAS A19', 'ALUMINIO ESPECIAL'),
('013801.10001', '01380110001', 'QUADRO ACO INFANT T12R20 VBRAKE BTO A19', 'LINHA AÇO'),
('013803.10003', '01380310003', 'QUADRO ACO CECI T12R20 BRANCO A19', 'LINHA AÇO'),
('014235.10005', '01423510005', 'QUADRO EASY RIDER PRETO ELE A19', 'ALUMINIO ESPECIAL'),
('014236.10006', '01423610006', 'QUADRO AL TM BSD TRATADO ELE A19', 'ALUMINIO ESPECIAL'),
('014427.10007', '01442710007', 'QUADRO SNAP T11R20V7 AMARELO A21', 'LINHA AÇO'),
('014445.10009', '01444510009', 'QUADRO ACO CECI AZUL CRU A21', 'LINHA AÇO'),
('014456.10007', '01445610007', 'QUADRO ACO CECI R16 PRETO A21', 'LINHA AÇO'),
('014534.10006', '01453410006', 'QUADRO ALUMINIO BTO MTBR26 A21', 'ALUMINIO ESPECIAL'),
('015183.10003', '01518310003', 'QUADRO BTO T10 R16 A22', 'LINHA TOYS'),
('015917.10007', '01591710007', 'QUADRO CECI R16 BCO A25', 'LINHA TOYS'),
('015920.10000', '01592010000', 'QUADRO POWER REX R16 PTO A25', 'LINHA TOYS')
ON CONFLICT (normalized_part_number) DO NOTHING;

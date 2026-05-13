-- Migration 004: Tabela principal de lotes de retrabalho

-- Função para gerar código de lote
CREATE OR REPLACE FUNCTION generate_lot_code()
RETURNS text AS $$
DECLARE
  today_str text;
  seq_num integer;
BEGIN
  today_str := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(substring(lot_code FROM 'RT-\d{8}-(\d+)') AS integer)
  ), 0) + 1
  INTO seq_num
  FROM public.rework_lots
  WHERE lot_code LIKE 'RT-' || today_str || '-%';

  RETURN 'RT-' || today_str || '-' || lpad(seq_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.rework_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code text NOT NULL UNIQUE,
  part_number_id uuid NOT NULL REFERENCES public.product_master(id),
  quantity_initial numeric NOT NULL CHECK (quantity_initial > 0),
  quantity_open numeric NOT NULL CHECK (quantity_open >= 0),
  origin_area text NOT NULL,
  current_status text NOT NULL DEFAULT 'open' CHECK (
    current_status IN (
      'open', 'in_rework', 'awaiting_quality',
      'partially_approved', 'approved',
      'partially_scrapped', 'scrapped',
      'closed', 'cancelled'
    )
  ),
  quality_status text NOT NULL DEFAULT 'pending_block' CHECK (
    quality_status IN (
      'pending_block', 'blocked', 'in_inspection',
      'approved', 'rejected', 'unblocked', 'scrap_approved'
    )
  ),
  defect_type_id uuid REFERENCES public.defect_types(id),
  defect_description text NOT NULL,
  quality_block_required boolean NOT NULL DEFAULT true,
  quality_block_number text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rework_lots ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_rework_lots_updated_at
  BEFORE UPDATE ON public.rework_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_rework_lots_status ON public.rework_lots(current_status);
CREATE INDEX IF NOT EXISTS idx_rework_lots_quality_status ON public.rework_lots(quality_status);
CREATE INDEX IF NOT EXISTS idx_rework_lots_opened_at ON public.rework_lots(opened_at);
CREATE INDEX IF NOT EXISTS idx_rework_lots_part_number ON public.rework_lots(part_number_id);
CREATE INDEX IF NOT EXISTS idx_rework_lots_lot_code ON public.rework_lots(lot_code);

-- Migration 002: Cadastro mestre de materiais (part numbers)

-- Função de normalização de part number
CREATE OR REPLACE FUNCTION normalize_part_number(pn text)
RETURNS text AS $$
BEGIN
  -- Remove pontos, espaços, barras, hífens. Mantém zeros à esquerda.
  RETURN regexp_replace(pn, '[.\s/\-]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.product_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text NOT NULL,
  normalized_part_number text NOT NULL UNIQUE,
  description text NOT NULL,
  family text,
  material_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_master ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_product_master_updated_at
  BEFORE UPDATE ON public.product_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índices para busca e autocomplete
CREATE INDEX IF NOT EXISTS idx_product_master_pn ON public.product_master(part_number);
CREATE INDEX IF NOT EXISTS idx_product_master_normalized ON public.product_master(normalized_part_number);
CREATE INDEX IF NOT EXISTS idx_product_master_family ON public.product_master(family);
CREATE INDEX IF NOT EXISTS idx_product_master_active ON public.product_master(active);
CREATE INDEX IF NOT EXISTS idx_product_master_description ON public.product_master USING gin(to_tsvector('portuguese', description));

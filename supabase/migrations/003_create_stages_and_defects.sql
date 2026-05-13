-- Migration 003: Etapas do processo e tipos de defeito

-- Etapas do processo
CREATE TABLE IF NOT EXISTS public.process_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sequence integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.process_stages ENABLE ROW LEVEL SECURITY;

-- Seeds: etapas em ordem
INSERT INTO public.process_stages (name, sequence) VALUES
  ('Entrada', 1),
  ('Montagem', 2),
  ('Pintura Pó', 3),
  ('Pintura Líquida', 4),
  ('Tratamento Térmico', 5),
  ('Solda Aço', 6),
  ('Solda Alumínio', 7),
  ('Decapagem Química', 8),
  ('Decapagem Térmica', 9),
  ('Qualidade', 10),
  ('Aprovado', 11),
  ('Sucata', 12)
ON CONFLICT (name) DO NOTHING;

-- Tipos de defeito
CREATE TABLE IF NOT EXISTS public.defect_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  process_area text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.defect_types ENABLE ROW LEVEL SECURITY;

-- Seeds: tipos de defeito
INSERT INTO public.defect_types (name) VALUES
  ('Falha de solda'),
  ('Trinca'),
  ('Porosidade'),
  ('Amassado'),
  ('Risco'),
  ('Falha de pintura'),
  ('Contaminação'),
  ('Falha dimensional'),
  ('Falha de decapagem'),
  ('Retrabalho de montagem'),
  ('Falha de tratamento térmico'),
  ('Outro')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_process_stages_sequence ON public.process_stages(sequence);
CREATE INDEX IF NOT EXISTS idx_defect_types_active ON public.defect_types(active);

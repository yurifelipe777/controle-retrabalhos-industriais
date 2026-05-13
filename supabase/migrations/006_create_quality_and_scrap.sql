-- Migration 006: Eventos de qualidade, sucata, anexos e auditoria

-- Eventos de qualidade
CREATE TABLE IF NOT EXISTS public.quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.rework_lots(id),
  event_type text NOT NULL CHECK (
    event_type IN ('block', 'unblock', 'inspection', 'approve', 'reject', 'send_to_scrap')
  ),
  quantity numeric CHECK (quantity IS NULL OR quantity > 0),
  result text,
  quality_document text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.quality_events ENABLE ROW LEVEL SECURITY;

-- Eventos de sucata
CREATE TABLE IF NOT EXISTS public.scrap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.rework_lots(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scrap_events ENABLE ROW LEVEL SECURITY;

-- Anexos
CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid REFERENCES public.rework_lots(id),
  file_url text NOT NULL,
  file_type text,
  description text,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Log de auditoria
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Snapshots legado (opcional)
CREATE TABLE IF NOT EXISTS public.legacy_rework_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date,
  part_number text,
  normalized_part_number text,
  description text,
  family text,
  stage_name text,
  quantity numeric,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legacy_rework_snapshots ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX IF NOT EXISTS idx_quality_events_lot_id ON public.quality_events(lot_id);
CREATE INDEX IF NOT EXISTS idx_quality_events_type ON public.quality_events(event_type);
CREATE INDEX IF NOT EXISTS idx_scrap_events_lot_id ON public.scrap_events(lot_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON public.audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

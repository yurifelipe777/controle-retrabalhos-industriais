-- Migration 005: Movimentações e saldos por etapa

CREATE TABLE IF NOT EXISTS public.lot_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.rework_lots(id),
  from_stage_id uuid REFERENCES public.process_stages(id),
  to_stage_id uuid NOT NULL REFERENCES public.process_stages(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  movement_type text NOT NULL DEFAULT 'transfer' CHECK (
    movement_type IN ('initial', 'transfer', 'adjustment', 'reversal')
  ),
  moved_at timestamptz NOT NULL DEFAULT now(),
  moved_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lot_movements ENABLE ROW LEVEL SECURITY;

-- Tabela de saldos materializados
CREATE TABLE IF NOT EXISTS public.lot_stage_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.rework_lots(id),
  stage_id uuid NOT NULL REFERENCES public.process_stages(id),
  balance_quantity numeric NOT NULL DEFAULT 0 CHECK (balance_quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lot_id, stage_id)
);

ALTER TABLE public.lot_stage_balances ENABLE ROW LEVEL SECURITY;

-- Trigger: atualizar saldo após inserção de movimento
CREATE OR REPLACE FUNCTION update_stage_balance_on_movement()
RETURNS trigger AS $$
BEGIN
  -- Reduz saldo na etapa de origem (se houver)
  IF NEW.from_stage_id IS NOT NULL THEN
    INSERT INTO public.lot_stage_balances (lot_id, stage_id, balance_quantity)
    VALUES (NEW.lot_id, NEW.from_stage_id, 0)
    ON CONFLICT (lot_id, stage_id)
    DO UPDATE SET
      balance_quantity = public.lot_stage_balances.balance_quantity - NEW.quantity,
      updated_at = now();

    -- Garantia anti-negativo
    IF (SELECT balance_quantity FROM public.lot_stage_balances
        WHERE lot_id = NEW.lot_id AND stage_id = NEW.from_stage_id) < 0 THEN
      RAISE EXCEPTION 'Saldo insuficiente na etapa de origem';
    END IF;
  END IF;

  -- Aumenta saldo na etapa de destino
  INSERT INTO public.lot_stage_balances (lot_id, stage_id, balance_quantity)
  VALUES (NEW.lot_id, NEW.to_stage_id, NEW.quantity)
  ON CONFLICT (lot_id, stage_id)
  DO UPDATE SET
    balance_quantity = public.lot_stage_balances.balance_quantity + NEW.quantity,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stage_balance
  AFTER INSERT ON public.lot_movements
  FOR EACH ROW EXECUTE FUNCTION update_stage_balance_on_movement();

-- Índices
CREATE INDEX IF NOT EXISTS idx_lot_movements_lot_id ON public.lot_movements(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_movements_moved_at ON public.lot_movements(moved_at);
CREATE INDEX IF NOT EXISTS idx_lot_stage_balances_lot_id ON public.lot_stage_balances(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_stage_balances_stage_id ON public.lot_stage_balances(stage_id);

-- sdd/stock-usado-componentes (ADR-2): cada movimiento de stock lleva su condicion.
-- Aditiva: las filas existentes quedan NUEVO por el default, que se CONSERVA (un
-- binario anterior sigue insertando sin la columna y cae en NUEVO).
ALTER TABLE "movimientos_insumo"
  ADD COLUMN "condicion" VARCHAR(10) NOT NULL DEFAULT 'NUEVO',
  ADD CONSTRAINT "movimientos_insumo_condicion_check" CHECK ("condicion" IN ('NUEVO', 'USADO'));

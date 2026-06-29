-- Migration: rename fecha_resolucion → fecha_cierre (ADR-6, PR3)
-- Change: tickets-maquina-estados-observaciones / Task P3.T11
--
-- Idempotent: only renames if fecha_resolucion still exists.
-- Safe to run on all tenant DBs regardless of current state.
-- Uses DO $$ block so Prisma migrate does not wrap in a transaction it can't use.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name   = 'tickets'
      AND column_name  = 'fecha_resolucion'
  ) THEN
    ALTER TABLE tickets RENAME COLUMN fecha_resolucion TO fecha_cierre;
  END IF;
END
$$;

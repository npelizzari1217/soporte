-- Rename fecha_vencimiento → fecha_resolucion preserving existing data.
-- ALTER TABLE ... RENAME COLUMN is atomic and does NOT drop+recreate (ADR-3).
-- Idempotencia garantizada por _prisma_migrations (prisma migrate deploy no re-aplica).
ALTER TABLE tickets RENAME COLUMN fecha_vencimiento TO fecha_resolucion;

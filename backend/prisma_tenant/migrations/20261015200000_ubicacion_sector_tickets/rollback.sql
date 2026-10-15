-- Rollback de 20261015200000_ubicacion_sector_tickets. Se puede correr dos veces.
DROP INDEX IF EXISTS "tickets_sector_id_idx";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_sector_id_fkey";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sector_id";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "ubicacion";

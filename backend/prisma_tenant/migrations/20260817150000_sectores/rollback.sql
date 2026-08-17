-- Rollback de 20260817150000_sectores (WU-03). Sin pérdida de datos previos
-- (S67: nadie backfillea sector_id, así que no hay nada que preservar).
DROP INDEX IF EXISTS "compras_sector_id_idx";
ALTER TABLE "compras" DROP CONSTRAINT IF EXISTS "compras_sector_id_fkey";
ALTER TABLE "compras" DROP COLUMN IF EXISTS "sector_id";
DROP INDEX IF EXISTS "sectores_codigo_key";
DROP TABLE IF EXISTS "sectores";

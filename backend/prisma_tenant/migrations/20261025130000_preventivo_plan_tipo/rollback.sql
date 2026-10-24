-- Rollback de 20261025130000_preventivo_plan_tipo. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee tipo_id falla sin la columna.
-- Pierde el tipo elegido en cada plan: el codigo anterior genera todos los planes con PREVENTIVO.
DROP INDEX IF EXISTS "planes_preventivo_tipo_id_idx";
ALTER TABLE "planes_preventivo" DROP CONSTRAINT IF EXISTS "planes_preventivo_tipo_id_fkey";
ALTER TABLE "planes_preventivo" DROP COLUMN IF EXISTS "tipo_id";

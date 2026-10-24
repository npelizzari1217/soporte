-- Rollback de 20261025100000_preventivo_anticipacion. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee anticipacion_* falla sin estas columnas.
ALTER TABLE "planes_preventivo" DROP CONSTRAINT IF EXISTS "planes_preventivo_anticipacion_menor_cadencia_check";
ALTER TABLE "planes_preventivo" DROP CONSTRAINT IF EXISTS "planes_preventivo_anticipacion_unidad_check";
ALTER TABLE "planes_preventivo" DROP CONSTRAINT IF EXISTS "planes_preventivo_anticipacion_valor_check";
ALTER TABLE "planes_preventivo" DROP COLUMN IF EXISTS "anticipacion_unidad";
ALTER TABLE "planes_preventivo" DROP COLUMN IF EXISTS "anticipacion_valor";

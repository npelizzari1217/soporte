-- Rollback de 20261106100000_items_compra_es_servicio. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee es_servicio falla sin la columna.
ALTER TABLE "items_compra" DROP CONSTRAINT IF EXISTS "items_compra_servicio_sin_insumo_check";
ALTER TABLE "items_compra" DROP COLUMN IF EXISTS "es_servicio";

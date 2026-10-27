-- Rollback de 20261027100000_compras_tipo_ticket. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee tipo_ticket_id falla sin la columna.
-- Pierde el tipo de cada compra: con el codigo anterior todas las compras vuelven a ser visibles
-- para cualquiera con LECTURA de Compras.
DROP INDEX IF EXISTS "compras_tipo_ticket_id_idx";
ALTER TABLE "compras" DROP CONSTRAINT IF EXISTS "compras_tipo_ticket_id_fkey";
ALTER TABLE "compras" DROP COLUMN IF EXISTS "tipo_ticket_id";

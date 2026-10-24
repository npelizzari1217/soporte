-- Rollback de 20261025110000_tickets_fecha_objetivo. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee fecha_objetivo falla sin la columna.
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "fecha_objetivo";

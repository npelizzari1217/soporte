-- Rollback de 20261104100000_tickets_modalidad. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee modalidad falla sin la columna.
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_modalidad_check";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "modalidad";

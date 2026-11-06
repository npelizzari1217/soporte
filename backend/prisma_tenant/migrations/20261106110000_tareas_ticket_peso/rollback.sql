-- Rollback de 20261106110000_tareas_ticket_peso. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee peso falla sin la columna.
ALTER TABLE "tareas_ticket" DROP CONSTRAINT IF EXISTS "tareas_ticket_peso_check";
ALTER TABLE "tareas_ticket" DROP COLUMN IF EXISTS "peso";

-- Rollback de 20261025120000_tickets_recordatorio_preventivo. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo: la aplicacion que lee recordatorio_enviado_at falla sin la columna.
DROP INDEX IF EXISTS "tickets_recordatorio_pendiente_idx";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "recordatorio_enviado_at";

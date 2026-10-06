-- Rollback de 20261007150000_tickets_primera_respuesta.
DROP INDEX IF EXISTS "tickets_primera_respuesta_pendiente_idx";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "primera_respuesta_vencida";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "primera_respuesta_vence_at";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "primera_respuesta_at";

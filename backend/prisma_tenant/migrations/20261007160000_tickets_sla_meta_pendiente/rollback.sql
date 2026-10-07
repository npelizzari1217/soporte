-- Rollback de 20261007160000_tickets_sla_meta_pendiente.
DROP INDEX IF EXISTS "tickets_sla_meta_pendiente_idx";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_meta_pendiente";

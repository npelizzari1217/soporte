-- Rollback de 20261007130000_tickets_reloj_sla.
DROP INDEX IF EXISTS "operaciones_ticket_ticket_id_sla_reloj_seq_idx";
ALTER TABLE "operaciones_ticket" DROP COLUMN IF EXISTS "sla_reloj_seq";
DROP INDEX IF EXISTS "tickets_sla_reloj_pendiente_idx";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_sla_meta_s_check";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_sla_acumulado_s_check";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_cumplido";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_reloj_pendiente";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_reloj_version";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_reloj_seq_hasta";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_corre_desde";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_meta_s";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "sla_acumulado_s";

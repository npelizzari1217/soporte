-- Rollback de 20261007140000_prioridades_primera_respuesta.
ALTER TABLE "prioridades" DROP CONSTRAINT IF EXISTS "prioridades_sla_primera_respuesta_horas_check";
ALTER TABLE "prioridades" DROP COLUMN IF EXISTS "sla_primera_respuesta_horas";

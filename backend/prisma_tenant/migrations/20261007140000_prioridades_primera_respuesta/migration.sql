-- M3 (sla-primera-respuesta R2): meta opcional de primera respuesta por
-- prioridad, en horas habiles. NULL = sin meta. Las prioridades existentes
-- quedan sin meta: no hay recalculo ni relleno.
ALTER TABLE "prioridades" ADD COLUMN "sla_primera_respuesta_horas" INTEGER;

ALTER TABLE "prioridades"
  ADD CONSTRAINT "prioridades_sla_primera_respuesta_horas_check"
  CHECK ("sla_primera_respuesta_horas" IS NULL OR "sla_primera_respuesta_horas" > 0);

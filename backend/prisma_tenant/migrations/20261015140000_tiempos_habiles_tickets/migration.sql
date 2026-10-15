-- odd/promedios-dashboard-habiles T1: tiempos habiles guardados por ticket, en segundos, para que
-- el dashboard promedie con AVG en SQL en vez de recorrer el historial en cada consulta.
-- - resolucion_habil_s: el acumulado del reloj de SLA (tiempo habil sin pausas) tomado al llegar a
--   RESUELTO. Lo escribe solo el pliegue del reloj; al reabrir vuelve a NULL.
-- - primera_respuesta_habil_s: horas habiles creacion -> primera respuesta, fijas al registrarse.
-- Sin DEFAULT: NULL es "sin dato" y el promedio lo excluye.
ALTER TABLE "tickets" ADD COLUMN "resolucion_habil_s" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "primera_respuesta_habil_s" INTEGER;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolucion_habil_s_check"
    CHECK ("resolucion_habil_s" IS NULL OR "resolucion_habil_s" >= 0);
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_primera_respuesta_habil_s_check"
    CHECK ("primera_respuesta_habil_s" IS NULL OR "primera_respuesta_habil_s" >= 0);

-- Backfill de lo que el reloj ya sabe: tickets HABIL en RESUELTO o CERRADO, con el reloj
-- incorporado (acumulado no NULL) y sin pliegue pendiente. El resto (sin reloj, CORRIDO, o con
-- pliegue pendiente) queda NULL: lo completa scripts/backfill-tiempos-habiles.mjs o el pliegue.
UPDATE "tickets" AS t
   SET "resolucion_habil_s" = t."sla_acumulado_s"
  FROM "estados" AS e
 WHERE e."id" = t."estado_id"
   AND e."codigo" IN ('RESUELTO', 'CERRADO')
   AND t."sla_regla" = 'HABIL'
   AND t."sla_acumulado_s" IS NOT NULL
   AND t."sla_reloj_pendiente" = false;

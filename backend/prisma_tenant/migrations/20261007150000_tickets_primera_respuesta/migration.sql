-- sdd/sla-primera-respuesta-y-pausa WU-6 (M4): registro de la primera respuesta.
-- primera_respuesta_vence_at queda en NULL para todo ticket existente: no hay meta ni
-- vencimiento retroactivos (sla-primera-respuesta R5). Solo se rellena la FECHA a partir del
-- historial. El DEFAULT false de primera_respuesta_vencida es espejo del @default de Prisma
-- (dos fuentes; un test de deriva las compara).
ALTER TABLE "tickets" ADD COLUMN "primera_respuesta_at" TIMESTAMPTZ;
ALTER TABLE "tickets" ADD COLUMN "primera_respuesta_vence_at" TIMESTAMPTZ;
ALTER TABLE "tickets" ADD COLUMN "primera_respuesta_vencida" BOOLEAN NOT NULL DEFAULT false;

-- Indice del barrido de primera respuesta (WU-7): solo los tickets con meta, sin respuesta y sin marca.
CREATE INDEX "tickets_primera_respuesta_pendiente_idx" ON "tickets" ("primera_respuesta_vence_at")
    WHERE "primera_respuesta_at" IS NULL
      AND NOT "primera_respuesta_vencida"
      AND "primera_respuesta_vence_at" IS NOT NULL;

-- Relleno desde el historial: el primer comentario PUBLICO no borrado de alguien distinto del
-- solicitante (cualquier autor si el solicitante es externo: solicitante_id NULL). Idempotente
-- por la condicion IS NULL; no toca la meta ni el vencimiento.
UPDATE "tickets" t SET "primera_respuesta_at" = sub."primera"
FROM (
  SELECT o."ticket_id", MIN(o."created_at") AS "primera"
  FROM "operaciones_ticket" o
  JOIN "tipo_operacion" top ON top."id" = o."tipo_operacion_id" AND top."codigo" = 'COMENTARIO'
  JOIN "tickets" tt ON tt."id" = o."ticket_id"
  WHERE o."es_interno" = false AND o."deleted_at" IS NULL
    AND (tt."solicitante_id" IS NULL OR o."autor_id" <> tt."solicitante_id")
  GROUP BY o."ticket_id"
) sub
WHERE t."id" = sub."ticket_id" AND t."primera_respuesta_at" IS NULL;

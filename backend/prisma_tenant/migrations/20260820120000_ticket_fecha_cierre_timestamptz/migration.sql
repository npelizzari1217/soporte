-- `tickets.fecha_cierre` deja de ser un `date` truncado y pasa a guardar el
-- INSTANTE real de cierre (`timestamptz`). El día argentino se deriva recién
-- en presentación (CSV, dashboard) — nunca se vuelve a leer un componente UTC
-- crudo como si fuera el día.
--
-- POR QUÉ (D1, sdd/corregir-fecha-cierre-tickets/design): un `ALTER ... TYPE
-- timestamptz` sin `USING` resuelve la medianoche contra el TimeZone de LA
-- SESIÓN que corre la migración — `America/Sao_Paulo` en producción, `UTC` en
-- el contenedor Docker local (verificado empíricamente, #2338/#2345) — así que
-- la misma migración produciría instantes DISTINTOS según quién la corra.
-- `INTERVAL '-03:00'` es un literal que Postgres resuelve sin leer ningún GUC
-- de sesión ni tzdata: mismo resultado en cualquier entorno. Es la misma
-- constante que `OFFSET_ARGENTINA_MS` en `shared/domain/zona-horaria-argentina.ts`,
-- así que la DB y la app comparten un solo modelo de "Argentina". El cast
-- `::timestamp` explícito es OBLIGATORIO: `date` tiene cast implícito tanto a
-- `timestamp` como a `timestamptz`, y si Postgres eligiera el segundo
-- reintroduciría la dependencia de la TZ de sesión que este cambio elimina.
--
-- AlterTable
ALTER TABLE "tickets"
  ALTER COLUMN "fecha_cierre" TYPE timestamptz
  USING ("fecha_cierre"::timestamp AT TIME ZONE INTERVAL '-03:00');

-- BACKFILL (D2): para cada ticket ya cerrado, reemplaza la medianoche ART
-- convertida por el instante REAL de la última transición hacia un estado que
-- cierra (RESUELTO/CERRADO), leído de `operaciones_ticket`. Reproduce lo que
-- `transicionar-estado.use-case.ts` ya hizo en su momento: `MAX(created_at)`
-- sobre transiciones *hacia* un estado que cierra es la transición autoritativa
-- para una fila hoy no-nula (un RESUELTO→CERRADO válido termina en el instante
-- más reciente). Filas sin ninguna operación coincidente conservan la
-- medianoche ART ya convertida por el `ALTER` de arriba — aceptado por el
-- proposal, reportado (no silenciado) por el script de verificación post-deploy.
--
-- Este UPDATE es idempotente: vuelve a calcular el mismo MAX(created_at) para
-- filas ya correctas, así que una segunda corrida no las corrompe.
UPDATE "tickets" t
SET "fecha_cierre" = o.instante
FROM (
  SELECT op."ticket_id", MAX(op."created_at") AS instante
  FROM "operaciones_ticket" op
  JOIN "estados" e ON e."id" = op."estado_nuevo_id"
  WHERE e."codigo" IN ('RESUELTO', 'CERRADO') AND op."deleted_at" IS NULL
  GROUP BY op."ticket_id"
) o
WHERE t."id" = o."ticket_id" AND t."fecha_cierre" IS NOT NULL;

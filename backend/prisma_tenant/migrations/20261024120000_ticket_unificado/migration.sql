-- Ticket unificado (odd/tasks/ticket-unificado.md, T1, S1 y S3): las compras vinculadas, la
-- ubicación y los comentarios pasan del satélite `ticket_edilicia` al ticket, para todos los tipos.
--
-- Qué hace, en este orden:
-- 1. Crea `ticket_compra`, el vínculo ticket ↔ compra, y copia los vínculos de `reparacion_compra`
--    (conservando id y `created_at`, que es la marca de inicio del bloqueo).
-- 2. Copia `ticket_edilicia.ubicacion` a `tickets.ubicacion` cuando el ticket no tiene una propia.
-- 3. Copia `comentarios_reparacion` al timeline del ticket (`operaciones_ticket`, tipo COMENTARIO).
--
-- Las tablas y la columna viejas quedan como están: desde esta migración nadie las escribe, y T4
-- las retira. Re-ejecutable: cada copia es `ON CONFLICT DO NOTHING` o condicionada, así que una
-- segunda corrida no duplica ni pisa nada.
--
-- El `rollback.sql` de esta carpeta deja las tablas viejas como proyección de las nuevas y borra
-- `ticket_compra`; sus límites están documentados allí.

-- ─── 1. Vínculo ticket ↔ compra ───────────────────────────────────────────────
--
-- Mismo diseño que `reparacion_compra` (migración 20260822120000), con el ticket en lugar del
-- satélite: a nivel de cabecera de compra, HARD DELETE sin `deleted_at` (un vínculo equivocado es
-- un error de dato), sin `updated_at` (el vínculo no se edita) y sin CHECK (las dos FKs y la UNIQUE
-- agotan las reglas de la tabla).
CREATE TABLE IF NOT EXISTS "ticket_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_compra_pkey" PRIMARY KEY ("id")
);

-- UNIQUE sobre el par: da idempotencia a vincular (ON CONFLICT DO NOTHING) y evita duplicar la
-- compra en "qué compras frenan el ticket". Su prefijo izquierdo (ticket_id) cubre la lectura por
-- lote del listado y la del bloqueo, así que no hace falta otro índice sobre ticket_id.
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_compra_ticket_compra_key"
    ON "ticket_compra"("ticket_id", "compra_id");

-- ON DELETE RESTRICT en las dos: borrar una compra o un ticket no se lleva en silencio por qué el
-- ticket estuvo frenado. Las dos tablas usan baja lógica: RESTRICT es un respaldo.
ALTER TABLE "ticket_compra" DROP CONSTRAINT IF EXISTS "ticket_compra_ticket_id_fkey";
ALTER TABLE "ticket_compra" ADD CONSTRAINT "ticket_compra_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_compra" DROP CONSTRAINT IF EXISTS "ticket_compra_compra_id_fkey";
ALTER TABLE "ticket_compra" ADD CONSTRAINT "ticket_compra_compra_id_fkey"
    FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `ticket_edilicia.ticket_id` es UNIQUE y `reparacion_compra` es UNIQUE por (satélite, compra): el
-- par (ticket, compra) no puede repetirse. El ON CONFLICT sin destino cubre también la corrida
-- repetida (mismo id).
INSERT INTO "ticket_compra" ("id", "ticket_id", "compra_id", "created_at")
SELECT rc."id", te."ticket_id", rc."compra_id", rc."created_at"
  FROM "reparacion_compra" rc
  JOIN "ticket_edilicia" te ON te."id" = rc."ticket_edilicia_id"
ON CONFLICT DO NOTHING;

-- ─── 2. Ubicación única ───────────────────────────────────────────────────────
--
-- Regla determinística ante un conflicto: GANA EL TICKET. Si el ticket ya tiene ubicación (no nula
-- ni en blanco), no se toca, aunque el satélite tenga otra; el aviso informa cuántos casos hubo
-- (producción, 2026-10-24: 0, L8). Una ubicación en blanco del satélite no se copia.
DO $$
DECLARE
    conflictos INTEGER;
BEGIN
    SELECT count(*) INTO conflictos
      FROM "tickets" t
      JOIN "ticket_edilicia" te ON te."ticket_id" = t."id"
     WHERE btrim(COALESCE(t."ubicacion", '')) <> ''
       AND btrim(COALESCE(te."ubicacion", '')) <> ''
       AND t."ubicacion" IS DISTINCT FROM te."ubicacion";
    IF conflictos > 0 THEN
        RAISE NOTICE 'ticket_unificado: % ticket(s) con ubicacion propia distinta de la del satelite; se conserva la del ticket.', conflictos;
    END IF;
END $$;

UPDATE "tickets" t
   SET "ubicacion" = te."ubicacion"
  FROM "ticket_edilicia" te
 WHERE te."ticket_id" = t."id"
   AND btrim(COALESCE(t."ubicacion", '')) = ''
   AND btrim(COALESCE(te."ubicacion", '')) <> '';

-- ─── 3. Comentarios al timeline ───────────────────────────────────────────────
--
-- Cada comentario de reparación pasa a ser un COMENTARIO del ticket con el mismo id, autor, texto
-- y fecha (`updated_at` = `created_at`: el comentario nunca se editó). Va PÚBLICO (`es_interno =
-- false`): el comentario de reparación no tenía visibilidad propia y lo veía todo el que veía la
-- reparación, que es exactamente quien ve un comentario público del ticket (`LECTURA` sobre el
-- tipo). No toca la primera respuesta ni el reloj de SLA: esos solo los escriben los casos de uso,
-- y el reloj solo pliega operaciones CAMBIO_ESTADO.
--
-- Sin el tipo COMENTARIO en el catálogo, la migración falla en vez de perder los comentarios.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "comentarios_reparacion")
       AND NOT EXISTS (SELECT 1 FROM "tipo_operacion" WHERE "codigo" = 'COMENTARIO') THEN
        RAISE EXCEPTION 'ticket_unificado: falta el tipo de operacion COMENTARIO y hay comentarios de reparacion para copiar.';
    END IF;
END $$;

INSERT INTO "operaciones_ticket" (
    "id", "ticket_id", "tipo_operacion_id", "descripcion", "autor_id", "es_interno",
    "created_at", "updated_at"
)
SELECT cr."id", te."ticket_id", tipo."id", cr."texto", cr."autor_id", false,
       cr."created_at", cr."created_at"
  FROM "comentarios_reparacion" cr
  JOIN "ticket_edilicia" te ON te."id" = cr."ticket_edilicia_id"
  JOIN "tipo_operacion" tipo ON tipo."codigo" = 'COMENTARIO'
ON CONFLICT ("id") DO NOTHING;

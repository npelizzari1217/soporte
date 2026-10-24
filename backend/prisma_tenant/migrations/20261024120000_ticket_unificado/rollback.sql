-- Rollback de 20261024120000_ticket_unificado. Re-ejecutable.
--
-- Después de la migración, la fuente es el ticket: `ticket_compra`, `tickets.ubicacion` y el
-- timeline. El rollback vuelve a escribir las tablas viejas como proyección de esa fuente sobre los
-- tickets que tienen satélite de Edilicia, que es lo único que el código anterior sabe leer, y
-- después borra `ticket_compra`.
--
-- Límites:
-- - Los vínculos de compra de un ticket SIN satélite se pierden: `reparacion_compra` no los puede
--   guardar, y con ellos se pierde el bloqueo de ese ticket.
-- - `tickets.ubicacion` queda como está, también la copiada del satélite: el código anterior la
--   muestra como ubicación general, con el mismo valor.
-- - Un satélite que tenía una ubicación distinta de la del ticket (el conflicto en el que ganó el
--   ticket; 0 casos en producción al 2026-10-24) queda con la del ticket.
-- - Los comentarios escritos después de la migración quedan en el timeline del ticket y no vuelven a
--   `comentarios_reparacion`: no se distinguen de un comentario hecho desde el ticket.
-- - Correr este archivo no borra la fila de la migración en `_prisma_migrations`.

-- ─── Compras: `reparacion_compra` := `ticket_compra` sobre los tickets con satélite ─────────
DO $$
BEGIN
    IF to_regclass('"ticket_compra"') IS NOT NULL THEN
        -- Un vínculo quitado después de la migración no vuelve.
        DELETE FROM "reparacion_compra" rc
         USING "ticket_edilicia" te
         WHERE te."id" = rc."ticket_edilicia_id"
           AND NOT EXISTS (
               SELECT 1 FROM "ticket_compra" tc
                WHERE tc."ticket_id" = te."ticket_id" AND tc."compra_id" = rc."compra_id"
           );

        -- Un vínculo creado después de la migración sí, si el ticket tiene satélite.
        INSERT INTO "reparacion_compra" ("id", "ticket_edilicia_id", "compra_id", "created_at")
        SELECT tc."id", te."id", tc."compra_id", tc."created_at"
          FROM "ticket_compra" tc
          JOIN "ticket_edilicia" te ON te."ticket_id" = tc."ticket_id"
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

DROP TABLE IF EXISTS "ticket_compra";

-- ─── Ubicación: el satélite vuelve a tener la del ticket ──────────────────────
-- Después de la migración se edita solo `tickets.ubicacion`; el código anterior lee la del satélite.
UPDATE "ticket_edilicia" te
   SET "ubicacion" = t."ubicacion"
  FROM "tickets" t
 WHERE t."id" = te."ticket_id"
   AND te."ubicacion" IS DISTINCT FROM t."ubicacion";

-- ─── Comentarios: se quitan del timeline las copias de la migración ───────────
-- Tienen el mismo id que el original, que sigue en `comentarios_reparacion`: sin quitarlas, el
-- código anterior mostraría cada comentario dos veces, en la reparación y en el ticket.
DELETE FROM "operaciones_ticket" o
 USING "comentarios_reparacion" cr
 WHERE o."id" = cr."id";

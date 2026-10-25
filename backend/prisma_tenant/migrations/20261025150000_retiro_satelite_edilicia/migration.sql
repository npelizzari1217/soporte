-- Retiro del satélite de Edilicia (odd/tasks/ticket-unificado.md, T4b, L37 y L41): borra
-- `comentarios_reparacion`, `reparacion_compra` y `ticket_edilicia`.
--
-- Desde la migración 20261024120000 sus datos viven en el ticket (`ticket_compra`,
-- `tickets.ubicacion`, `operaciones_ticket`), y desde T4a ningún código las lee ni las escribe
-- (`sin-tablas-del-satelite.spec.ts`). Esta migración va en un deploy POSTERIOR al de T4a: con el
-- código anterior a T4a corriendo, borrarlas rompe la pantalla Edilicia.
--
-- Prechecks, antes de borrar nada:
-- - ABORTA si un comentario de reparación no tiene su copia en `operaciones_ticket` (mismo id): es
--   el único dato de estas tablas que no queda en otro lado.
-- - AVISA (NOTICE) los vínculos de compra sin par en `ticket_compra` y las ubicaciones del satélite
--   que el ticket no tiene: después de la copia, desvincular una compra o vaciar la ubicación desde
--   el ticket es un uso legítimo, así que no frenan la migración. Quedan en el dump previo.
--
-- Re-ejecutable y tolerante a una base donde alguna ya no esté (una corrida previa, o un tenant
-- retocado a mano): todo va condicionado con `to_regclass` o `IF EXISTS`. Los `DROP` van SIN `CASCADE`: si apareciera
-- un dependiente que no conocemos (una FK, una vista), la migración falla en vez de llevárselo.
--
-- El `rollback.sql` de esta carpeta recrea las tablas; sus límites están documentados allí.

DO $$
DECLARE
    sin_copia INTEGER;
    vinculos_sin_par INTEGER;
    ubicaciones_sin_par INTEGER;
BEGIN
    IF to_regclass('public.comentarios_reparacion') IS NOT NULL THEN
        SELECT count(*) INTO sin_copia
          FROM "comentarios_reparacion" cr
         WHERE NOT EXISTS (SELECT 1 FROM "operaciones_ticket" o WHERE o."id" = cr."id");
        IF sin_copia > 0 THEN
            RAISE EXCEPTION 'retiro_satelite_edilicia: % comentario(s) de reparacion sin copia en operaciones_ticket; no se borra nada.', sin_copia;
        END IF;
    END IF;

    IF to_regclass('public.reparacion_compra') IS NOT NULL
       AND to_regclass('public.ticket_edilicia') IS NOT NULL THEN
        SELECT count(*) INTO vinculos_sin_par
          FROM "reparacion_compra" rc
          JOIN "ticket_edilicia" te ON te."id" = rc."ticket_edilicia_id"
         WHERE NOT EXISTS (
             SELECT 1 FROM "ticket_compra" tc
              WHERE tc."ticket_id" = te."ticket_id" AND tc."compra_id" = rc."compra_id"
         );
        IF vinculos_sin_par > 0 THEN
            RAISE NOTICE 'retiro_satelite_edilicia: % vinculo(s) de reparacion_compra sin par en ticket_compra (desvinculados despues de la copia).', vinculos_sin_par;
        END IF;
    END IF;

    IF to_regclass('public.ticket_edilicia') IS NOT NULL THEN
        SELECT count(*) INTO ubicaciones_sin_par
          FROM "ticket_edilicia" te
          JOIN "tickets" t ON t."id" = te."ticket_id"
         WHERE btrim(COALESCE(te."ubicacion", '')) <> ''
           AND btrim(COALESCE(t."ubicacion", '')) = '';
        IF ubicaciones_sin_par > 0 THEN
            RAISE NOTICE 'retiro_satelite_edilicia: % satelite(s) con ubicacion que el ticket no tiene (vaciada despues de la copia).', ubicaciones_sin_par;
        END IF;
    END IF;
END $$;

-- Primero las dos que apuntan al satélite, después el satélite.
DROP TABLE IF EXISTS "comentarios_reparacion";
DROP TABLE IF EXISTS "reparacion_compra";
DROP TABLE IF EXISTS "ticket_edilicia";

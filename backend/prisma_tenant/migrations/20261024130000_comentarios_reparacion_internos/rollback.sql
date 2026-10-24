-- Rollback de 20261024130000_comentarios_reparacion_internos. Re-ejecutable.
--
-- Devuelve a públicas las copias de los comentarios de reparación (las filas de
-- `operaciones_ticket` con el id de una de `comentarios_reparacion`), como las dejó
-- 20261024120000_ticket_unificado.
--
-- Orden: se corre ANTES que el rollback de 20261024120000, que es el que quita esas copias del
-- timeline. Después de él, este no encuentra filas y no hace nada.
--
-- Límites:
-- - Los comentarios escritos desde Edilicia después del deploy quedan internos: no se distinguen de
--   un comentario interno hecho desde el ticket.
-- - Correr este archivo no borra la fila de la migración en `_prisma_migrations`.
UPDATE "operaciones_ticket" o
   SET "es_interno" = false
  FROM "comentarios_reparacion" cr
 WHERE o."id" = cr."id"
   AND o."es_interno" = true;

-- Comentarios de reparación internos (odd/tasks/ticket-unificado.md, T2b, S3, decisión L19).
--
-- La migración 20261024120000_ticket_unificado copió cada comentario de reparación al timeline del
-- ticket como COMENTARIO público, con el mismo id. El dueño decidió (L19) que esos comentarios son
-- INTERNOS: los ve solo quien tiene Comentario interno (`OBSERVAR`) sobre el tipo del ticket. Esta
-- migración marca como internas las copias, que se reconocen por tener el id de una fila de
-- `comentarios_reparacion` (congelada hasta que T4 la retire).
--
-- Va en una migración aparte, y no editando la anterior, porque esa ya está aplicada: Prisma compara
-- el checksum de cada `migration.sql` aplicado y rechazaría el cambio.
--
-- Re-ejecutable: una segunda corrida no encuentra copias públicas que marcar. No toca `updated_at`:
-- el texto no se editó, cambió su visibilidad por una regla de producto.
--
-- Si después se corre el rollback de 20261024120000 y se la vuelve a aplicar, las copias vuelven
-- públicas: hay que volver a correr esta también (ver DEPLOY-VPS-runbook.md, "Ticket unificado").
UPDATE "operaciones_ticket" o
   SET "es_interno" = true
  FROM "comentarios_reparacion" cr
 WHERE o."id" = cr."id"
   AND o."es_interno" = false;

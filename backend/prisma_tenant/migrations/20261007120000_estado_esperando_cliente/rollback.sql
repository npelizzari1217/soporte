-- Rollback de 20261007120000_estado_esperando_cliente.
-- Los tickets que esperan al cliente vuelven a EN_PROCESO (el estado desde el que se
-- entra) y recién entonces se borra la fila: tickets y operaciones_ticket la referencian
-- por FK. Las operaciones históricas que apuntan al estado también se reubican.
UPDATE "tickets"
   SET "estado_id" = (SELECT "id" FROM "estados" WHERE "codigo" = 'EN_PROCESO')
 WHERE "estado_id" = (SELECT "id" FROM "estados" WHERE "codigo" = 'ESPERANDO_CLIENTE');
UPDATE "operaciones_ticket"
   SET "estado_anterior_id" = (SELECT "id" FROM "estados" WHERE "codigo" = 'EN_PROCESO')
 WHERE "estado_anterior_id" = (SELECT "id" FROM "estados" WHERE "codigo" = 'ESPERANDO_CLIENTE');
UPDATE "operaciones_ticket"
   SET "estado_nuevo_id" = (SELECT "id" FROM "estados" WHERE "codigo" = 'EN_PROCESO')
 WHERE "estado_nuevo_id" = (SELECT "id" FROM "estados" WHERE "codigo" = 'ESPERANDO_CLIENTE');
DELETE FROM "estados" WHERE "codigo" = 'ESPERANDO_CLIENTE';

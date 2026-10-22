-- Rollback de 20261022120000_tipos_operacion_borrado.
-- `operaciones_ticket` referencia el tipo por FK, así que primero se borran las entradas del
-- historial de borrado y recuperación, y recién después los tipos. Re-ejecutable: sin filas, no
-- hace nada. No recupera los tickets borrados: `tickets.deleted_at` queda como está.
DELETE FROM "operaciones_ticket"
 WHERE "tipo_operacion_id" IN (
   SELECT "id" FROM "tipo_operacion"
    WHERE "codigo" IN ('TICKET_BORRADO', 'TICKET_RECUPERADO')
 );
DELETE FROM "tipo_operacion"
 WHERE "codigo" IN ('TICKET_BORRADO', 'TICKET_RECUPERADO');

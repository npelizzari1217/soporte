-- Rollback de 20261022120000_tipos_operacion_borrado.
--
-- NO borra las entradas TICKET_BORRADO / TICKET_RECUPERADO de `operaciones_ticket`, y por eso deja
-- en el catálogo los tipos que esas entradas referencian (odd/tasks/permisos-por-tipo-ticket.md,
-- L45). El historial es la pista de auditoría del borrado: dice quién borró cada ticket y cuándo.
-- El rollback tampoco recupera los tickets borrados (`tickets.deleted_at` queda como está), así que
-- siguen recuperables por SQL, y sin esas entradas nadie sabría por qué faltan ni quién los quitó.
--
-- Solo quita los tipos que ninguna entrada usa: el código anterior a la migración no los escribe, y
-- un tipo referenciado no se podría borrar sin romper la FK. Re-ejecutable: una segunda corrida no
-- encuentra nada que quitar. Reaplicar `migration.sql` después no duplica: inserta con
-- `ON CONFLICT ("codigo") DO NOTHING`.
DELETE FROM "tipo_operacion" t
 WHERE t."codigo" IN ('TICKET_BORRADO', 'TICKET_RECUPERADO')
   AND NOT EXISTS (
     SELECT 1 FROM "operaciones_ticket" o WHERE o."tipo_operacion_id" = t."id"
   );

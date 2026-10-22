-- Tipos de operación del borrado lógico de un ticket (odd/tasks/permisos-por-tipo-ticket.md, S8).
--
-- Se suman al catálogo `tipo_operacion` para que el historial del ticket registre quién lo borró y
-- quién lo recuperó, y cuándo. `tipo_operacion` no tiene CHECK sobre `codigo`: el catálogo es una
-- tabla, así que alcanza con insertar las filas.
-- Los tenants nuevos también los reciben: el alta de un cliente corre `migrate deploy`.
-- Idempotente: `codigo` es UNIQUE, reaplicar no duplica filas.
INSERT INTO "tipo_operacion" ("codigo", "nombre", "activo", "updated_at")
VALUES
  ('TICKET_BORRADO', 'Ticket borrado', true, CURRENT_TIMESTAMP),
  ('TICKET_RECUPERADO', 'Ticket recuperado', true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- Tipos de operación de las tareas de un ticket (odd/tareas-con-tecnico, T2).
--
-- Se suman al catálogo `tipo_operacion` para que el historial del ticket registre el alta, la
-- asignación (o el retiro) del técnico, el completado, el descompletado y la baja de cada tarea.
-- Los tenants nuevos también los reciben: el alta de un cliente corre `migrate deploy`.
-- Idempotente: `codigo` es UNIQUE, reaplicar no duplica filas.
INSERT INTO "tipo_operacion" ("codigo", "nombre", "activo", "updated_at")
VALUES
  ('TAREA_CREADA', 'Tarea creada', true, CURRENT_TIMESTAMP),
  ('TAREA_ASIGNADA', 'Tarea asignada', true, CURRENT_TIMESTAMP),
  ('TAREA_COMPLETADA', 'Tarea completada', true, CURRENT_TIMESTAMP),
  ('TAREA_DESCOMPLETADA', 'Tarea descompletada', true, CURRENT_TIMESTAMP),
  ('TAREA_ELIMINADA', 'Tarea eliminada', true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

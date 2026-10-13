-- Rollback de 20261013140000_tareas_ticket. Re-ejecutable.
--
-- En esta etapa `subtareas_edilicia` sigue intacta: la migración solo copió sus filas, y el código
-- sigue escribiendo en ella hasta T3. Borrar `tareas_ticket` antes de desplegar T3 no pierde nada.
-- Después de T3, las tareas creadas o cambiadas en la tabla nueva SE PIERDEN con este rollback.
DROP TABLE IF EXISTS "tareas_ticket";

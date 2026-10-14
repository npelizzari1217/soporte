-- Retiro de `subtareas_edilicia`, `ticket_edilicia.personal_asignado_id` y
-- `ticket_edilicia.porcentaje_avance` (odd/tareas-con-tecnico, T8).
--
-- Precondición: la migración 20261013140000_tareas_ticket ya copió las subtareas a `tareas_ticket`
-- (mismos ids), y desde T3 ningún código lee ni escribe lo que se borra acá:
-- - las subtareas son las tareas del ticket base (`tareas_ticket`);
-- - `personal_asignado_id` nunca se usó (CA9);
-- - el avance se calcula al leer, con las tareas activas del ticket (decisión del dueño del
--   2026-10-14 de retirar también la columna guardada).
--
-- Al borrar las columnas, Postgres borra con ellas el índice
-- `ticket_edilicia_porcentaje_avance_idx` y el CHECK `ticket_edilicia_porcentaje_avance_check`.
-- `personal_asignado_id` no tenía FK ni índice. El `rollback.sql` de esta carpeta recrea todo y
-- repuebla la tabla vieja desde `tareas_ticket`.
DROP TABLE "subtareas_edilicia";

ALTER TABLE "ticket_edilicia" DROP COLUMN "personal_asignado_id";

ALTER TABLE "ticket_edilicia" DROP COLUMN "porcentaje_avance";

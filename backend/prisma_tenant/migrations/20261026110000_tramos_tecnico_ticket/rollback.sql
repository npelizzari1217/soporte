-- Rollback de 20261026110000_tramos_tecnico_ticket. Re-ejecutable.
--
-- Borra la tabla entera (sus índices y constraints se van con ella): se pierden los tramos
-- medidos desde el deploy, y no hay forma de reconstruirlos. Antes de correrlo en un tenant con
-- uso real, hacer un dump de la tabla. No toca `tickets` ni `operaciones_ticket`.
DROP TABLE IF EXISTS "tramos_tecnico_ticket";

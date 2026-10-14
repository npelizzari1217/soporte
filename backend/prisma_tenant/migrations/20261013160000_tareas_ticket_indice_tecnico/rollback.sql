-- Rollback de 20261013160000_tareas_ticket_indice_tecnico. Re-ejecutable y sin perdida de datos:
-- solo borra el indice.
DROP INDEX IF EXISTS "tareas_ticket_tecnico_id_deleted_at_ticket_id_idx";

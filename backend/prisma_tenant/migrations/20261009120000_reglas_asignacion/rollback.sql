-- Rollback de 20261009120000_reglas_asignacion. DESTRUCTIVO: borra las reglas configuradas
-- (ningún ticket las referencia: la asignación ya hecha vive en `tickets.asignado_id`).
DROP TABLE IF EXISTS "reglas_asignacion";

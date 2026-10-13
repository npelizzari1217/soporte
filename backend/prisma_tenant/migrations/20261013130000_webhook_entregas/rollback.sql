-- Rollback de 20261013130000_webhook_entregas. DESTRUCTIVO: borra la cola y el registro de
-- entregas, incluidos los avisos pendientes (ninguna otra tabla los referencia). Re-ejecutable.
DROP TABLE IF EXISTS "webhook_entregas";

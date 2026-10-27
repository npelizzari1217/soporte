-- Rollback de 20261026120000_asistente_ia_config.
--
-- DESTRUCTIVO: borra la configuracion de IA de TODOS los clientes, incluidas sus claves. Despues del
-- rollback, cada cliente vuelve al modo de respaldo (responde con la Ayuda) y, si se reaplica la
-- migracion, ROOT tiene que volver a cargar la clave de cada uno. Respaldo previo:
--   \copy (SELECT cliente_id, url, modelo, clave_cifrada FROM asistente_ia_config) TO 'asistente_ia_config_backup.csv' CSV HEADER
--
-- El codigo que usa esta tabla debe estar revertido ANTES de correr este rollback. Se puede correr
-- mas de una vez: `IF EXISTS` lo hace re-ejecutable.
DROP TABLE IF EXISTS "asistente_ia_config";

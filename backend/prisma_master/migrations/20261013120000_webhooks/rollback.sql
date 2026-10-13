-- Rollback de 20261013120000_webhooks.
--
-- DESTRUCTIVO: borra la configuracion de webhooks de todos los clientes, secretos incluidos. Al
-- volver a migrar, cada administrador tiene que configurar el destino de nuevo y entregar el
-- secreto nuevo a su integrador.
--
-- El codigo que usa esta tabla debe estar revertido ANTES de correr este rollback. Se puede correr
-- mas de una vez: `IF EXISTS` lo hace re-ejecutable.
DROP TABLE IF EXISTS "webhook_destinos";

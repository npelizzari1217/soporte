-- Rollback de 20261015120000_throttler_contadores.
--
-- NO DESTRUCTIVO para datos de negocio: solo borra los contadores de los limitadores de pedidos.
-- Al perderlos, cada cupo arranca de cero, igual que en un reinicio con el storage en memoria.
--
-- El codigo que usa esta tabla debe estar revertido ANTES de correr este rollback: si no, cada
-- pedido limitado falla la consulta y el limitador deja pasar todo (fail-open). Se puede correr
-- mas de una vez: `IF EXISTS` lo hace re-ejecutable.
DROP TABLE IF EXISTS "throttler_contadores";

-- Rollback de 20261003170000_pedidos_publicos_pendientes.
--
-- DESTRUCTIVO: borra los pedidos publicos aun sin verificar de este tenant. Los links de
-- confirmacion ya enviados responderan 404. El codigo que usa la tabla
-- (PrismaPedidoPendienteRepository) debe estar revertido ANTES de correr este rollback.
DROP INDEX IF EXISTS "pedidos_publicos_pendientes_equipo_id_idx";
DROP INDEX IF EXISTS "pedidos_publicos_pendientes_expires_at_idx";
DROP TABLE IF EXISTS "pedidos_publicos_pendientes";

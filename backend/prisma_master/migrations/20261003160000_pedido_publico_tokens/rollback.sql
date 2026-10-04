-- Rollback de 20261003160000_pedido_publico_tokens.
--
-- DESTRUCTIVO: borra todos los tokens de verificacion. Los links de confirmacion enviados y aun
-- no usados dejan de resolver (responden 404). El codigo que usa la tabla
-- (PrismaPedidoPublicoTokenRepository) debe estar revertido ANTES de correr este rollback.
DROP INDEX IF EXISTS "pedido_publico_tokens_cliente_id_idx";
DROP INDEX IF EXISTS "pedido_publico_tokens_token_hash_key";
DROP TABLE IF EXISTS "pedido_publico_tokens";

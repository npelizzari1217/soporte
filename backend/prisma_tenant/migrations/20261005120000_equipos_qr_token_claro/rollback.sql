-- Rollback de 20261005120000_equipos_qr_token_claro.
--
-- DESTRUCTIVO: borra el token en claro de todos los QR. Los hashes quedan, asi que los QR
-- impresos siguen resolviendo, pero la ficha ya no puede volver a mostrarlos (vuelve a valer la
-- D8 original: hay que regenerar para ver uno).
ALTER TABLE "equipos_informaticos"
  DROP CONSTRAINT IF EXISTS "equipos_informaticos_qr_token_requiere_hash_chk",
  DROP COLUMN IF EXISTS "qr_token";

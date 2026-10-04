-- Rollback de 20261003130000_equipos_qr.
--
-- DESTRUCTIVO: borra el hash de todos los QR emitidos. Los QR impresos dejan de resolver
-- (abren el formulario sin equipo) y hay que regenerarlos si se vuelve a aplicar la migracion.
DROP INDEX IF EXISTS "equipos_informaticos_qr_token_hash_key";
ALTER TABLE "equipos_informaticos"
  DROP COLUMN IF EXISTS "qr_emitido_at",
  DROP COLUMN IF EXISTS "qr_token_hash";

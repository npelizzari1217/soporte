-- Rollback de 20261003120000_add_cliente_formulario_publico.
--
-- DESTRUCTIVO: borra el slug, la habilitacion y el congelamiento de TODOS los
-- clientes. Si ya se imprimieron QR, esas URLs dejan de resolver: revertir
-- solo tiene sentido antes de emitir el primer QR.
--
-- El codigo que lee estas columnas (ClienteMapper, ClienteEntity,
-- IClienteRepository.findBySlug/congelarSlug/cambiarSlugSiNoCongelado) debe
-- estar revertido ANTES de correr este rollback.
ALTER TABLE "clientes" DROP CONSTRAINT IF EXISTS "clientes_slug_formato_check";
DROP INDEX IF EXISTS "clientes_slug_key";
ALTER TABLE "clientes"
  DROP COLUMN IF EXISTS "slug_congelado_at",
  DROP COLUMN IF EXISTS "formulario_publico_habilitado",
  DROP COLUMN IF EXISTS "slug";

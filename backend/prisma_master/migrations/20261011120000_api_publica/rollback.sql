-- Rollback de 20261011120000_api_publica.
--
-- DESTRUCTIVO: borra todas las claves de API y pierde la marca de usuario de integracion y el
-- flag de API habilitada de cada cliente. Los sistemas externos que usaban claves dejan de entrar.
--
-- Los usuarios de integracion se DESACTIVAN (usuario y membresias), no se borran: asi sobreviven
-- los nombres de autor de los tickets y comentarios que crearon en las bases tenant, y
-- `membresias.usuario_id` es ON DELETE RESTRICT. Sin la marca, se los sigue reconociendo por el
-- email `integracion+<clienteId>@integraciones.invalid`. La desactivacion corre ANTES de borrar la
-- columna `es_integracion`, que es la que los identifica.
--
-- El codigo que usa estas columnas y esta tabla debe estar revertido ANTES de correr este rollback.
-- Se puede correr mas de una vez: los `IF EXISTS` lo hacen re-ejecutable, y el `ADD COLUMN IF NOT
-- EXISTS` repone `es_integracion` (en `false`) si una corrida anterior ya la borro, para que los
-- `UPDATE` que la leen no fallen. En esa segunda corrida no desactivan a nadie: ya se hizo.
DROP TABLE IF EXISTS "api_claves";
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "es_integracion" BOOLEAN NOT NULL DEFAULT false;
UPDATE "membresias" SET "activo" = false, "updated_at" = CURRENT_TIMESTAMP
  WHERE "usuario_id" IN (SELECT "id" FROM "usuarios" WHERE "es_integracion");
UPDATE "usuarios" SET "activo" = false, "updated_at" = CURRENT_TIMESTAMP WHERE "es_integracion";
ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "es_integracion";
ALTER TABLE "clientes" DROP COLUMN IF EXISTS "api_habilitada";

-- Rollback de 20260819120000_kb_articulo_slug.
--
-- DESTRUCTIVO EN UN SENTIDO ACOTADO: se pierde la columna `slug` y con ella la
-- identidad estable de los artículos sincronizados desde el repositorio. Los
-- artículos en sí NO se borran — quedan como filas sin slug, indistinguibles
-- de las cargadas a mano por el cliente.
--
-- CONSECUENCIA al volver a aplicar la migración: el sync ya no reconoce esos
-- artículos y los INSERTA de nuevo, dejando duplicados que hay que limpiar a
-- mano. Antes de correr esto en una base con datos reales, respaldar el par
-- (id, slug) de `kb_articulos`.
DROP INDEX IF EXISTS "kb_articulos_slug_key";
ALTER TABLE "kb_articulos" DROP CONSTRAINT IF EXISTS "kb_articulos_slug_formato_check";
ALTER TABLE "kb_articulos" DROP COLUMN IF EXISTS "slug";

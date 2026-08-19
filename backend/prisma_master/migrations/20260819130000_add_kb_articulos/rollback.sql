-- Rollback de 20260819130000_add_kb_articulos.
--
-- DESTRUCTIVO: borra TODOS los artículos de Ayuda del sistema, incluidos los
-- que se hayan escrito desde la aplicación. Los que se mantienen como markdown
-- en `backend/ayuda/*.md` se recuperan corriendo `pnpm sync:ayuda` después de
-- volver a aplicar la migración; los escritos a mano NO se recuperan.
--
-- Antes de correr esto contra una base con datos reales, respaldar la tabla:
--   \copy kb_articulos to 'kb_articulos.csv' csv header
DROP TABLE IF EXISTS "kb_articulos";

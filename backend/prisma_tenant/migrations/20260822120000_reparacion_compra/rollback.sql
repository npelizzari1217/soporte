-- Rollback de 20260822120000_reparacion_compra.
--
-- DESTRUCTIVO: la tabla es nueva, así que el rollback se lleva TODOS los
-- vínculos reparación-compra cargados desde que se aplicó la migración. No
-- hay dónde preservarlos (no existía columna ni tabla previa que los
-- albergara) — respaldar antes de correr esto en una base con datos reales.
ALTER TABLE "reparacion_compra" DROP CONSTRAINT IF EXISTS "reparacion_compra_compra_id_fkey";
ALTER TABLE "reparacion_compra" DROP CONSTRAINT IF EXISTS "reparacion_compra_ticket_edilicia_id_fkey";
DROP INDEX IF EXISTS "reparacion_compra_ticket_compra_key";
DROP TABLE IF EXISTS "reparacion_compra";

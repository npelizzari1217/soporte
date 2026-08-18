-- Rollback de 20260818120000_comentarios_reparacion.
--
-- DESTRUCTIVO: la tabla es nueva, así que el rollback se lleva TODOS los
-- comentarios cargados desde que se aplicó la migración. No hay dónde
-- preservarlos (no existía columna ni tabla previa que los albergara) —
-- respaldar antes de correr esto en una base con datos reales.
ALTER TABLE "comentarios_reparacion" DROP CONSTRAINT IF EXISTS "comentarios_reparacion_texto_check";
ALTER TABLE "comentarios_reparacion" DROP CONSTRAINT IF EXISTS "comentarios_reparacion_ticket_edilicia_id_fkey";
DROP INDEX IF EXISTS "comentarios_reparacion_ticket_created_at_idx";
DROP TABLE IF EXISTS "comentarios_reparacion";

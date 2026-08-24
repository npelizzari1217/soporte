-- Rollback de 20260823120000_encuestas_satisfaccion.
--
-- DESTRUCTIVO: la tabla es nueva, así que el rollback se lleva TODAS las
-- respuestas de satisfacción cargadas desde que se aplicó la migración. No
-- hay dónde preservarlas (no existía columna ni tabla previa que las
-- albergara) — respaldar antes de correr esto en una base con datos reales.
ALTER TABLE "encuestas_satisfaccion" DROP CONSTRAINT IF EXISTS "encuestas_satisfaccion_puntaje_check";
ALTER TABLE "encuestas_satisfaccion" DROP CONSTRAINT IF EXISTS "encuestas_satisfaccion_ticket_id_fkey";
DROP INDEX IF EXISTS "encuestas_satisfaccion_ticket_id_respondida_en_idx";
DROP INDEX IF EXISTS "encuestas_satisfaccion_token_id_key";
DROP TABLE IF EXISTS "encuestas_satisfaccion";

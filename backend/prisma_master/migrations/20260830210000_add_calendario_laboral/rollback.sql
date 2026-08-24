-- Rollback de 20260830210000_add_calendario_laboral.
--
-- DESTRUCTIVO: borra el calendario laboral completo (las 7 filas fijas) y
-- TODOS los feriados cargados, incluidos los que ROOT haya dado de alta desde
-- entonces. Antes de correr esto contra una base con datos reales, respaldar:
--   \copy calendario_laboral_dias to 'calendario_laboral_dias.csv' csv header
--   \copy feriados to 'feriados.csv' csv header
--
-- El código que lee este calendario (CalcularSlaVenceService, AplicarSlaUseCase,
-- PrismaCalendarioLaboralProvider) debe estar revertido ANTES de correr este
-- rollback — de lo contrario el cálculo de SLA falla en runtime al no
-- encontrar las tablas.
DROP TABLE IF EXISTS "feriados";
DROP TABLE IF EXISTS "calendario_laboral_dias";

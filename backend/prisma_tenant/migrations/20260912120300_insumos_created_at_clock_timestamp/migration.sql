-- Migration: 20260912120300_insumos_created_at_clock_timestamp
-- Issue #172 — cuarta y ultima de las unidades encadenadas. La primera
-- (20260912120000_modelos_equipo_created_at_clock_timestamp) lleva el
-- comentario completo del mecanismo; aca va solo lo propio de estas tablas.
--
-- QUE CAMBIA: el DEFAULT de created_at pasa de CURRENT_TIMESTAMP a
-- clock_timestamp() en insumos y en insumos_codigos_alternativos. No cambia
-- el tipo, ni la nulabilidad, ni ninguna fila existente.
--
-- POR QUE LAS DOS TABLAS JUNTAS: insumos_codigos_alternativos no es uno de
-- los cuatro catalogos que nombra el issue, pero sus filas las escribe el
-- MISMO PrismaInsumoRepository.save() que insumos, dentro de la MISMA
-- transaccion anidada. Separarlas dejaria media escritura corregida y media
-- no, en la misma operacion de usuario.
--
-- LAS FILAS EXISTENTES NO SE TOCAN: reescribir timestamps historicos
-- borraria la evidencia de que el desvio ocurrio. Incluye las filas de
-- produccion que quedaron con la fecha de alta tres horas en el futuro, que
-- son la evidencia que documenta el issue.
--
-- Quedan ~15 agregados del catalogo del backend con el patron viejo
-- (@default(now())) sin corregir: el issue #172 acoto el alcance al catalogo
-- de insumos. La causa de fondo del desvio del reloj sigue abierta en el
-- issue #173, que ademas documenta que updated_at no queda cubierto por
-- ninguna de estas cuatro unidades.
ALTER TABLE "insumos"
  ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();

ALTER TABLE "insumos_codigos_alternativos"
  ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();

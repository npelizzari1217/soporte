-- Migration: 20260912120200_unidades_medida_created_at_clock_timestamp
-- Issue #172 — tercera de cuatro unidades encadenadas. La primera
-- (20260912120000_modelos_equipo_created_at_clock_timestamp) lleva el
-- comentario completo del mecanismo; aca va solo lo propio de esta tabla.
--
-- QUE CAMBIA: el DEFAULT de created_at pasa de CURRENT_TIMESTAMP a
-- clock_timestamp() en unidades_medida. No cambia el tipo, ni la
-- nulabilidad, ni ninguna fila existente.
--
-- LAS FILAS EXISTENTES NO SE TOCAN: reescribir timestamps historicos
-- borraria la evidencia de que el desvio ocurrio. Incluye las unidades
-- sembradas por 20260911120000_seed_unidades_medida, que se insertaron con
-- SQL crudo y por lo tanto ya tenian la fecha correcta.
ALTER TABLE "unidades_medida"
  ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();

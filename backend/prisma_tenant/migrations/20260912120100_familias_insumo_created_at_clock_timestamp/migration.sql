-- Migration: 20260912120100_familias_insumo_created_at_clock_timestamp
-- Issue #172 — segunda de cuatro unidades encadenadas. La primera
-- (20260912120000_modelos_equipo_created_at_clock_timestamp) lleva el
-- comentario completo del mecanismo; aca va solo lo propio de esta tabla.
--
-- QUE CAMBIA: el DEFAULT de created_at pasa de CURRENT_TIMESTAMP a
-- clock_timestamp() en familias_insumo. No cambia el tipo, ni la
-- nulabilidad, ni ninguna fila existente.
--
-- LAS FILAS EXISTENTES NO SE TOCAN: reescribir timestamps historicos
-- borraria la evidencia de que el desvio ocurrio.
ALTER TABLE "familias_insumo"
  ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();

-- B2: columna `modulo` en tipos_ticket (separación estricta por módulo).
--
-- Expand → backfill heurístico → contract, todo atómico en una migración.
-- El backfill ESPEJA `inferirModuloDeCodigo` en src/shared/domain/modulos.ts:
-- si el `codigo` contiene el nombre de un módulo → ese módulo; si no → SOPORTE.
-- Esto scopea correctamente los tipos custom conocidos (COMPRAS_GENERALES,
-- EDUCATIVAS_COMPRAS → COMPRAS) sin dejar ninguna fila con módulo nulo.

-- Expand: columna nullable (transitoria dentro de esta migración).
ALTER TABLE "tipos_ticket" ADD COLUMN "modulo" VARCHAR(50);

-- Backfill: prioridad COMPRAS > EDILICIA > EQUIPOS > SOPORTE (fallback).
-- Los canónicos (SOPORTE/COMPRAS/EDILICIA) caen en la misma lógica por substring.
UPDATE "tipos_ticket" SET "modulo" = CASE
  WHEN "codigo" ILIKE '%COMPRAS%'  THEN 'COMPRAS'
  WHEN "codigo" ILIKE '%EDILICIA%' THEN 'EDILICIA'
  WHEN "codigo" ILIKE '%EQUIPOS%'  THEN 'EQUIPOS'
  ELSE 'SOPORTE'
END
WHERE "modulo" IS NULL;

-- Contract: NOT NULL una vez backfilleadas todas las filas.
ALTER TABLE "tipos_ticket" ALTER COLUMN "modulo" SET NOT NULL;

-- Índice para el listado filtrado por módulo (alta de cada módulo).
CREATE INDEX "tipos_ticket_modulo_activo_idx" ON "tipos_ticket" ("modulo", "activo");

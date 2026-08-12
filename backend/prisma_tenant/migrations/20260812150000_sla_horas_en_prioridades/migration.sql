-- SLA en prioridades: mueve horas+activo de la tabla separada `sla_config`
-- a columnas de `prioridades` (sla_horas/sla_activo). El CONCEPTO de SLA no
-- cambia (horas objetivo de resolución por prioridad) — solo la ubicación
-- de almacenamiento. `sla_config` se elimina.

-- 1. Agregar columnas nuevas a prioridades.
ALTER TABLE "prioridades" ADD COLUMN "sla_horas" INTEGER;
ALTER TABLE "prioridades" ADD COLUMN "sla_activo" BOOLEAN NOT NULL DEFAULT true;

-- 2. Backfill desde sla_config (si existen filas previas).
UPDATE "prioridades" p
SET "sla_horas" = sc."horas",
    "sla_activo" = sc."activo"
FROM "sla_config" sc
WHERE sc."prioridad_id" = p."id";

-- 3. CHECK (sla_horas IS NULL OR sla_horas > 0) — mismo criterio que el
--    CHECK (horas > 0) que tenía sla_config.
ALTER TABLE "prioridades"
  ADD CONSTRAINT "prioridades_sla_horas_check" CHECK ("sla_horas" IS NULL OR "sla_horas" > 0);

-- 4. Eliminar la tabla sla_config — el SLA ahora vive en prioridades.
DROP TABLE "sla_config";

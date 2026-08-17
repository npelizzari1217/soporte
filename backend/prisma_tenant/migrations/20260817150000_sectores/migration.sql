-- WU-03 (sdd/compras-tres-etapas-y-sectores, FASE 2, M1).
--
-- Catálogo nuevo `sectores` (destino de una compra: Computación, Librería,
-- Mantenimiento edilicio, ...), calcado de `tipos_ticket`: `codigo` UNIQUE
-- SIN índice parcial por `deleted_at` (un código dado de baja NO se
-- reutiliza, mismo criterio). Sin seed (ADR-T10): nace vacío, lo llena el
-- ADMINISTRADOR del cliente desde el ABM.
--
-- `compras.sector_id` nullable, sin backfill (S67: compras preexistentes
-- quedan sin sector, no se infiere ninguno). `ON DELETE RESTRICT`: borrar un
-- sector usado no debe vaciar en silencio la clasificación de compras
-- históricas — el camino correcto es desactivarlo (`activo=false`).
CREATE TABLE "sectores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "sectores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sectores_codigo_key" ON "sectores"("codigo");

ALTER TABLE "compras" ADD COLUMN "sector_id" UUID;
ALTER TABLE "compras" ADD CONSTRAINT "compras_sector_id_fkey"
    FOREIGN KEY ("sector_id") REFERENCES "sectores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "compras_sector_id_idx" ON "compras"("sector_id") WHERE "sector_id" IS NOT NULL;

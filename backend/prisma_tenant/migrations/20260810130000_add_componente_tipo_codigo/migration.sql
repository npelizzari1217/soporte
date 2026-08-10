-- AlterTable (expand)
-- Soft ref → master.tipos_componente.codigo (sin FK cross-DB). Nullable por
-- ahora: se puebla via backfill (scripts/backfill-tipos-componente-codigo.js,
-- PR4a) y recien pasa a NOT NULL en la migracion contract de PR4b, una vez
-- verificado cero-nulls en todos los tenants.
ALTER TABLE "componentes_equipo" ADD COLUMN "tipo_componente_codigo" VARCHAR(50);

-- CreateIndex
CREATE INDEX "componentes_equipo_tipo_componente_codigo_idx" ON "componentes_equipo"("tipo_componente_codigo");

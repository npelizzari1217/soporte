-- Rollback de 20261014120000_retiro_subtareas_edilicia. Re-ejecutable.
--
-- Recrea `subtareas_edilicia` y las dos columnas de `ticket_edilicia` con los tipos, defaults,
-- constraints e índices de 20260805194710_init_tenant, y repuebla lo que se pueda desde
-- `tareas_ticket`, que sigue siendo la fuente.
--
-- Límites:
-- - Solo vuelven las tareas de tickets con satélite de Edilicia: la tabla vieja no puede guardar
--   las de otros tipos, que siguen solo en `tareas_ticket`.
-- - Se pierde el técnico de cada tarea (`tecnico_id`): la tabla vieja no tenía esa columna.
-- - `personal_asignado_id` vuelve en NULL. Nunca se usó, así que no hay dato que recuperar.
-- - `porcentaje_avance` se recalcula con la fórmula de `calcularAvanceTareas`: completadas activas
--   sobre total activas, redondeado a 2 decimales, 0 sin tareas activas.
-- - Correr este archivo no borra la fila de la migración en `_prisma_migrations`.

CREATE TABLE IF NOT EXISTS "subtareas_edilicia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id" UUID NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "completada_en" TIMESTAMPTZ,
    "completada_por_id" UUID,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "subtareas_edilicia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subtareas_edilicia_ticket_edilicia_id_idx"
    ON "subtareas_edilicia"("ticket_edilicia_id");

ALTER TABLE "subtareas_edilicia"
    DROP CONSTRAINT IF EXISTS "subtareas_edilicia_ticket_edilicia_id_fkey";
ALTER TABLE "subtareas_edilicia" ADD CONSTRAINT "subtareas_edilicia_ticket_edilicia_id_fkey"
    FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_edilicia" ADD COLUMN IF NOT EXISTS "personal_asignado_id" UUID;
ALTER TABLE "ticket_edilicia"
    ADD COLUMN IF NOT EXISTS "porcentaje_avance" DECIMAL(5,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "ticket_edilicia_porcentaje_avance_idx"
    ON "ticket_edilicia"("porcentaje_avance");

ALTER TABLE "ticket_edilicia" DROP CONSTRAINT IF EXISTS "ticket_edilicia_porcentaje_avance_check";
ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_porcentaje_avance_check"
    CHECK ("porcentaje_avance" >= 0 AND "porcentaje_avance" <= 100);

-- Repoblado: las tareas de cada reparación, con sus ids. Una segunda corrida no duplica filas.
INSERT INTO "subtareas_edilicia" (
    "id", "ticket_edilicia_id", "descripcion", "completada", "completada_en", "completada_por_id",
    "orden", "created_at", "updated_at", "deleted_at"
)
SELECT
    t."id", te."id", t."descripcion", t."completada", t."completada_en", t."completada_por_id",
    t."orden", t."created_at", t."updated_at", t."deleted_at"
FROM "tareas_ticket" t
JOIN "ticket_edilicia" te ON te."ticket_id" = t."ticket_id"
ON CONFLICT ("id") DO NOTHING;

-- Avance guardado, sobre las tareas activas del ticket.
UPDATE "ticket_edilicia" te
SET "porcentaje_avance" = COALESCE((
    SELECT ROUND(
        (count(*) FILTER (WHERE t."completada") * 100.0) / NULLIF(count(*), 0), 2)
    FROM "tareas_ticket" t
    WHERE t."ticket_id" = te."ticket_id" AND t."deleted_at" IS NULL
), 0);

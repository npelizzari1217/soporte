-- Tabla `tareas_ticket` (odd/tareas-con-tecnico, T1): tareas de cualquier tipo de ticket, cada una
-- con un técnico opcional y el registro de quién la completó.
--
-- Copia las filas de `subtareas_edilicia` a la tabla nueva, a través de
-- `ticket_edilicia.ticket_id`. Conserva el id y todos los datos, incluidas las bajas lógicas;
-- `tecnico_id` queda en NULL porque las subtareas no lo tenían. La copia es idempotente
-- (ON CONFLICT (id) DO NOTHING): correrla de nuevo no duplica filas.
--
-- `subtareas_edilicia` y `ticket_edilicia.personal_asignado_id` NO se tocan acá: el código de
-- reparaciones las sigue usando hasta T3, y se retiran en una migración posterior (T8).
--
-- CHECK `tareas_ticket_completada_check`: completada = true exige `completada_en` y
-- `completada_por_id`; completada = false exige los dos en NULL. Se verificó contra los datos de
-- `subtareas_edilicia` de las bases locales antes de agregarlo. Si una base tuviera una fila que
-- lo viole, la migración falla entera en el INSERT y no aplica nada a medias.
CREATE TABLE "tareas_ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "tecnico_id" UUID,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "completada_en" TIMESTAMPTZ,
    "completada_por_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tareas_ticket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tareas_ticket_completada_check" CHECK (
        ("completada" AND "completada_en" IS NOT NULL AND "completada_por_id" IS NOT NULL)
        OR (NOT "completada" AND "completada_en" IS NULL AND "completada_por_id" IS NULL)
    )
);

-- Listado de las tareas activas de un ticket, en orden.
CREATE INDEX "tareas_ticket_ticket_id_deleted_at_orden_idx"
    ON "tareas_ticket"("ticket_id", "deleted_at", "orden");

-- Métrica "tareas completadas por técnico" (T4): rango sobre `completada_en`, agrupado o filtrado
-- por `completada_por_id`.
CREATE INDEX "tareas_ticket_completada_en_completada_por_id_idx"
    ON "tareas_ticket"("completada_en", "completada_por_id");

-- Mismo criterio que `operaciones_ticket`: los tickets se dan de baja lógica, y un borrado físico
-- no puede arrastrar el registro de las tareas.
ALTER TABLE "tareas_ticket" ADD CONSTRAINT "tareas_ticket_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Copia de datos desde `subtareas_edilicia`.
INSERT INTO "tareas_ticket" (
    "id", "ticket_id", "descripcion", "orden", "tecnico_id", "completada", "completada_en",
    "completada_por_id", "created_at", "updated_at", "deleted_at"
)
SELECT
    s."id", te."ticket_id", s."descripcion", s."orden", NULL, s."completada", s."completada_en",
    s."completada_por_id", s."created_at", s."updated_at", s."deleted_at"
FROM "subtareas_edilicia" s
JOIN "ticket_edilicia" te ON te."id" = s."ticket_edilicia_id"
ON CONFLICT ("id") DO NOTHING;

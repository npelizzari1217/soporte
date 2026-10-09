-- Tabla `reglas_asignacion` (roadmap segunda etapa, punto 9: asignación automática por tipo).
--
-- Una regla por tipo de ticket (PK = `tipo_id`): el responsable fijo al que se asigna el ticket
-- al abrirse. "Sin regla" = sin fila, por eso `responsable_id` es NOT NULL. Sin seed: nace vacía
-- y todos los tipos arrancan sin regla (el alta se comporta como hasta ahora).
--
-- `responsable_id` y `actualizado_por` son referencias blandas a `master.usuarios` (sin FK:
-- cross-DB, igual que `tickets.asignado_id`). Al borrar el tipo se borra su regla (CASCADE); la
-- baja de un tipo es lógica (`deleted_at`), así que la fila sobrevive y se reactiva con él.
CREATE TABLE "reglas_asignacion" (
    "tipo_id" UUID NOT NULL,
    "responsable_id" UUID NOT NULL,
    "actualizado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "reglas_asignacion_pkey" PRIMARY KEY ("tipo_id"),
    CONSTRAINT "reglas_asignacion_tipo_id_fkey" FOREIGN KEY ("tipo_id")
        REFERENCES "tipos_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

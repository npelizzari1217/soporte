-- odd/edilicia-obra-externa T3b: certificados de avance de obra (S5, S6, S8).
--
-- Un certificado agrupa tareas completadas de un ticket EXTERNA y vale la suma de sus pesos. Guarda
-- una COPIA del peso de cada tarea (S8): cambiar el peso despues no altera lo certificado.
-- Una tarea entra en un solo certificado vigente (S5): lo garantiza el indice unico parcial sobre
-- `certificacion_tarea (tarea_id) WHERE vigente`. Anular un certificado pone `vigente = false` en
-- sus filas y libera las tareas; el certificado anulado queda como registro.

CREATE TABLE "certificaciones_avance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    -- Correlativo por ticket (1, 2, ...), asignado con el lock del ticket tomado.
    "numero" INTEGER NOT NULL,
    -- Suma de los pesos copiados de sus tareas.
    "porcentaje" INTEGER NOT NULL,
    -- Soft ref -> master.usuarios.id. Sin FK cross-DB.
    "emitido_por_id" UUID NOT NULL,
    "emitido_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ,
    -- Soft ref -> master.usuarios.id. Sin FK cross-DB.
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "certificaciones_avance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificaciones_avance_ticket_id_fkey" FOREIGN KEY ("ticket_id")
        REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "certificaciones_avance_numero_check" CHECK ("numero" >= 1),
    CONSTRAINT "certificaciones_avance_porcentaje_check" CHECK ("porcentaje" BETWEEN 0 AND 100),
    -- Anulacion atomica: los tres campos juntos, y el motivo con al menos un caracter visible.
    CONSTRAINT "certificaciones_avance_anulacion_check" CHECK (
        ("anulado_en" IS NULL AND "anulado_por_id" IS NULL AND "motivo_anulacion" IS NULL)
        OR ("anulado_en" IS NOT NULL AND "anulado_por_id" IS NOT NULL
            AND "motivo_anulacion" IS NOT NULL AND btrim("motivo_anulacion") <> '')
    )
);
CREATE UNIQUE INDEX "certificaciones_avance_ticket_id_numero_key"
    ON "certificaciones_avance" ("ticket_id", "numero");

CREATE TABLE "certificacion_tarea" (
    "certificacion_id" UUID NOT NULL,
    "tarea_id" UUID NOT NULL,
    -- Copia del peso de la tarea al emitir (S8).
    "peso" INTEGER NOT NULL,
    -- false cuando el certificado se anula: la tarea queda libre para otro certificado.
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "certificacion_tarea_pkey" PRIMARY KEY ("certificacion_id", "tarea_id"),
    CONSTRAINT "certificacion_tarea_certificacion_id_fkey" FOREIGN KEY ("certificacion_id")
        REFERENCES "certificaciones_avance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "certificacion_tarea_tarea_id_fkey" FOREIGN KEY ("tarea_id")
        REFERENCES "tareas_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "certificacion_tarea_peso_check" CHECK ("peso" BETWEEN 0 AND 100)
);
-- S5: una tarea, un solo certificado vigente.
CREATE UNIQUE INDEX "certificacion_tarea_tarea_vigente_key"
    ON "certificacion_tarea" ("tarea_id") WHERE "vigente";

-- Historial del ticket (S8). Idempotente: `codigo` es UNIQUE.
INSERT INTO "tipo_operacion" ("codigo", "nombre", "activo", "updated_at")
VALUES
  ('CERTIFICADO_EMITIDO', 'Certificado de avance emitido', true, CURRENT_TIMESTAMP),
  ('CERTIFICADO_ANULADO', 'Certificado de avance anulado', true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

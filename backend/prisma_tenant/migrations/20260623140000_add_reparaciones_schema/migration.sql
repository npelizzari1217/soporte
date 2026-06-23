-- Migration: 20260623140000_add_reparaciones_schema
-- PR-15a (tarea 5.C.3): DDL del módulo Reparaciones Edilicias en la base de datos TENANT.
-- Agrega 3 tablas: ubicaciones, ticket_edilicia, subtareas_edilicia.
--
-- ubicaciones: árbol jerárquico N niveles via self-reference padre_id.
-- ticket_edilicia: satélite 1:1 de tickets para tipo.codigo='EDILICIA'.
--   personal_asignado_id: soft ref → master.usuarios.id (sin FK cross-DB).
--   porcentaje_avance: NUMERIC(5,2). CHECK (>= 0 AND <= 100). Recalculado por la app.
-- subtareas_edilicia: pasos concretos de la reparación.
--   completada_por_id: soft ref → master.usuarios.id.
--
-- Constraints especiales (no expresables en Prisma schema):
--   - ticket_edilicia.porcentaje_avance: CHECK (>= 0 AND <= 100)
--
-- Ref spec: SPEC:reparaciones/Tablas TENANT
-- Dependencia: migration 20260623130000_add_compras_schema debe existir.

-- ─── UBICACIONES (árbol jerárquico de locaciones físicas) ─────────────────────
--
-- padre_id: self-reference nullable (NULL = nodo raíz).
-- activo: FALSE = no disponible para nuevos tickets (no implica soft delete).
-- deleted_at: soft delete — las filas no se eliminan físicamente.

CREATE TABLE "ubicaciones" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "nombre"      VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "padre_id"    UUID,
    "activo"      BOOLEAN      NOT NULL DEFAULT TRUE,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"  TIMESTAMPTZ,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- ─── TICKET_EDILICIA (satélite 1:1 del ticket para el flujo EDILICIA) ─────────
--
-- ticket_id: UNIQUE → garantiza relación 1:1 con tickets.
-- personal_asignado_id: soft ref → master.usuarios.id (sin FK cross-DB).
-- porcentaje_avance: NUMERIC(5,2), recalculado por la app en cada mutación de subtarea.

CREATE TABLE "ticket_edilicia" (
    "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id"            UUID          NOT NULL,
    "ubicacion_id"         UUID          NOT NULL,
    "personal_asignado_id" UUID,
    "porcentaje_avance"    NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"           TIMESTAMPTZ,

    CONSTRAINT "ticket_edilicia_pkey" PRIMARY KEY ("id")
);

-- ─── SUBTAREAS_EDILICIA ────────────────────────────────────────────────────────
--
-- completada_por_id: soft ref → master.usuarios.id (sin FK cross-DB).
-- orden: para visualización ordenada en UI.

CREATE TABLE "subtareas_edilicia" (
    "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id"  UUID         NOT NULL,
    "descripcion"         VARCHAR(255) NOT NULL,
    "completada"          BOOLEAN      NOT NULL DEFAULT FALSE,
    "completada_en"       TIMESTAMPTZ,
    "completada_por_id"   UUID,
    "orden"               INTEGER      NOT NULL DEFAULT 0,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"          TIMESTAMPTZ,

    CONSTRAINT "subtareas_edilicia_pkey" PRIMARY KEY ("id")
);

-- ─── UNIQUE INDEXES ───────────────────────────────────────────────────────────

-- ticket_edilicia.ticket_id: garantiza relación 1:1 con tickets
CREATE UNIQUE INDEX "ticket_edilicia_ticket_id_key" ON "ticket_edilicia"("ticket_id");

-- ─── REGULAR INDEXES ──────────────────────────────────────────────────────────

-- ubicaciones.padre_id: hijos de un nodo (partial WHERE padre_id IS NOT NULL)
CREATE INDEX "ubicaciones_padre_id_idx" ON "ubicaciones"("padre_id") WHERE "padre_id" IS NOT NULL;

-- ubicaciones.activo: listado de ubicaciones activas (partial WHERE deleted_at IS NULL)
CREATE INDEX "ubicaciones_activo_idx" ON "ubicaciones"("activo") WHERE "deleted_at" IS NULL;

-- ticket_edilicia.ubicacion_id: tickets por ubicación
CREATE INDEX "ticket_edilicia_ubicacion_id_idx" ON "ticket_edilicia"("ubicacion_id");

-- ticket_edilicia.porcentaje_avance: filtrado/orden por avance
CREATE INDEX "ticket_edilicia_porcentaje_avance_idx" ON "ticket_edilicia"("porcentaje_avance");

-- subtareas_edilicia.ticket_edilicia_id: subtareas de un ticket (orden ASC, created_at ASC)
CREATE INDEX "subtareas_edilicia_ticket_edilicia_id_idx" ON "subtareas_edilicia"("ticket_edilicia_id");

-- ─── CHECK CONSTRAINTS ────────────────────────────────────────────────────────

-- ticket_edilicia.porcentaje_avance: debe estar entre 0 y 100
ALTER TABLE "ticket_edilicia"
    ADD CONSTRAINT "ticket_edilicia_porcentaje_avance_check"
    CHECK ("porcentaje_avance" >= 0 AND "porcentaje_avance" <= 100);

-- ─── FOREIGN KEYS ─────────────────────────────────────────────────────────────

-- ubicaciones.padre_id: self-reference para la jerarquía de árbol
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_padre_id_fkey"
    FOREIGN KEY ("padre_id") REFERENCES "ubicaciones"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ticket_edilicia → tickets (satélite 1:1)
ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ticket_edilicia → ubicaciones
ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_ubicacion_id_fkey"
    FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- subtareas_edilicia → ticket_edilicia
ALTER TABLE "subtareas_edilicia" ADD CONSTRAINT "subtareas_edilicia_ticket_edilicia_id_fkey"
    FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

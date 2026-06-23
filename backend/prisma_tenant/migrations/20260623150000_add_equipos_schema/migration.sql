-- Migration: 20260623150000_add_equipos_schema
-- PR-17a (tarea 6.C.3): DDL del módulo Equipos en la base de datos TENANT.
-- Agrega 5 tablas: tipos_componente, equipos_informaticos, componentes_equipo,
--                  archivos_equipo, ticket_soporte.
--
-- tipos_componente: catálogo de hardware. codigo UNIQUE (clave de idempotencia del seed).
-- equipos_informaticos: inventario de equipos del tenant.
--   numero_serie: UNIQUE PARCIAL WHERE NOT NULL (ver índice más abajo).
--     Prisma no expresa índices parciales con WHERE en el schema declarativo.
--     Se define aquí como raw SQL para que múltiples NULL coexistan sin conflicto.
--   asignado_a_id: soft ref → master.usuarios.id (sin FK cross-DB).
--   ubicacion_id: FK → ubicaciones.id (nullable).
-- componentes_equipo: hardware instalado en equipo. FK a equipo + tipo_componente.
-- archivos_equipo: adjuntos de equipo. Join table archivos ↔ equipos. ON DELETE CASCADE.
-- ticket_soporte: satélite 1:1 de tickets con tipo.codigo='SOPORTE'.
--   equipo_id: NULLABLE — un ticket de soporte puede no referenciar un equipo.
--
-- Ref spec: SPEC:equipos/Tablas TENANT
-- Dependencia: migration 20260623140000_add_reparaciones_schema debe existir.

-- ─── TIPOS_COMPONENTE (catálogo de tipos de hardware) ─────────────────────────

CREATE TABLE "tipos_componente" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "codigo"     VARCHAR(50)  NOT NULL,
    "nombre"     VARCHAR(100) NOT NULL,
    "activo"     BOOLEAN      NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tipos_componente_pkey" PRIMARY KEY ("id")
);

-- ─── EQUIPOS_INFORMATICOS (inventario de equipos del tenant) ─────────────────
--
-- asignado_a_id: soft ref → master.usuarios.id (sin FK cross-DB).
-- ubicacion_id: FK → ubicaciones.id. NULL = sin ubicación asignada.
-- activo: FALSE = dado de baja del inventario (distinto de deleted_at).

CREATE TABLE "equipos_informaticos" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "nombre"           VARCHAR(255) NOT NULL,
    "numero_serie"     VARCHAR(100),
    "marca"            VARCHAR(100),
    "modelo"           VARCHAR(100),
    "fecha_adquisicion" DATE,
    "ubicacion_id"     UUID,
    "asignado_a_id"    UUID,
    "activo"           BOOLEAN      NOT NULL DEFAULT TRUE,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"       TIMESTAMPTZ,

    CONSTRAINT "equipos_informaticos_pkey" PRIMARY KEY ("id")
);

-- ─── COMPONENTES_EQUIPO ────────────────────────────────────────────────────────

CREATE TABLE "componentes_equipo" (
    "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
    "equipo_id"         UUID         NOT NULL,
    "tipo_componente_id" UUID        NOT NULL,
    "descripcion"       TEXT,
    "numero_serie"      VARCHAR(100),
    "capacidad"         VARCHAR(100),
    "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMPTZ,

    CONSTRAINT "componentes_equipo_pkey" PRIMARY KEY ("id")
);

-- ─── ARCHIVOS_EQUIPO (join N:M archivos ↔ equipos) ───────────────────────────
--
-- Sin soft delete: ON DELETE CASCADE en ambos extremos.
-- PK compuesta (archivo_id, equipo_id).

CREATE TABLE "archivos_equipo" (
    "archivo_id" UUID        NOT NULL,
    "equipo_id"  UUID        NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_equipo_pkey" PRIMARY KEY ("archivo_id", "equipo_id")
);

-- ─── TICKET_SOPORTE (satélite 1:1 del ticket para el flujo SOPORTE) ───────────
--
-- equipo_id: NULLABLE — un ticket de soporte puede no referenciar un equipo.

CREATE TABLE "ticket_soporte" (
    "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id"            UUID        NOT NULL,
    "equipo_id"            UUID,
    "descripcion_problema" TEXT,
    "solucion_aplicada"    TEXT,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"           TIMESTAMPTZ,

    CONSTRAINT "ticket_soporte_pkey" PRIMARY KEY ("id")
);

-- ─── UNIQUE INDEXES ───────────────────────────────────────────────────────────

-- tipos_componente.codigo: catálogo con código único
CREATE UNIQUE INDEX "tipos_componente_codigo_key" ON "tipos_componente"("codigo");

-- ticket_soporte.ticket_id: garantiza relación 1:1 con tickets
CREATE UNIQUE INDEX "ticket_soporte_ticket_id_key" ON "ticket_soporte"("ticket_id");

-- equipos_informaticos.numero_serie: UNIQUE PARCIAL WHERE NOT NULL AND deleted_at IS NULL
-- Prisma no puede expresar WHERE en índices declarativos.
-- Esto permite múltiples filas con numero_serie = NULL y también permite
-- re-alta: un equipo soft-deleted libera su numero_serie para nuevas altas.
-- La unicidad SOLO aplica entre equipos ACTIVOS (deleted_at IS NULL).
-- Decisión de negocio (2026-06-23): numero_serie es único solo entre vivos.
CREATE UNIQUE INDEX "equipos_informaticos_numero_serie_key"
    ON "equipos_informaticos"("numero_serie")
    WHERE "numero_serie" IS NOT NULL AND "deleted_at" IS NULL;

-- ─── REGULAR INDEXES ──────────────────────────────────────────────────────────

-- equipos_informaticos.ubicacion_id: equipos por ubicación
CREATE INDEX "equipos_informaticos_ubicacion_id_idx" ON "equipos_informaticos"("ubicacion_id");

-- equipos_informaticos.asignado_a_id: equipos por usuario asignado
CREATE INDEX "equipos_informaticos_asignado_a_id_idx" ON "equipos_informaticos"("asignado_a_id");

-- componentes_equipo.equipo_id: componentes de un equipo
CREATE INDEX "componentes_equipo_equipo_id_idx" ON "componentes_equipo"("equipo_id");

-- componentes_equipo.tipo_componente_id: componentes por tipo
CREATE INDEX "componentes_equipo_tipo_componente_id_idx" ON "componentes_equipo"("tipo_componente_id");

-- archivos_equipo.equipo_id: archivos de un equipo
CREATE INDEX "archivos_equipo_equipo_id_idx" ON "archivos_equipo"("equipo_id");

-- ticket_soporte.equipo_id: tickets de un equipo (historial)
CREATE INDEX "ticket_soporte_equipo_id_idx" ON "ticket_soporte"("equipo_id");

-- ─── FOREIGN KEYS ─────────────────────────────────────────────────────────────

-- equipos_informaticos → ubicaciones (nullable FK)
ALTER TABLE "equipos_informaticos" ADD CONSTRAINT "equipos_informaticos_ubicacion_id_fkey"
    FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- componentes_equipo → equipos_informaticos
ALTER TABLE "componentes_equipo" ADD CONSTRAINT "componentes_equipo_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- componentes_equipo → tipos_componente
ALTER TABLE "componentes_equipo" ADD CONSTRAINT "componentes_equipo_tipo_componente_id_fkey"
    FOREIGN KEY ("tipo_componente_id") REFERENCES "tipos_componente"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- archivos_equipo → archivos (ON DELETE CASCADE)
ALTER TABLE "archivos_equipo" ADD CONSTRAINT "archivos_equipo_archivo_id_fkey"
    FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- archivos_equipo → equipos_informaticos (ON DELETE CASCADE)
ALTER TABLE "archivos_equipo" ADD CONSTRAINT "archivos_equipo_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ticket_soporte → tickets (satélite 1:1)
ALTER TABLE "ticket_soporte" ADD CONSTRAINT "ticket_soporte_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ticket_soporte → equipos_informaticos (nullable FK)
ALTER TABLE "ticket_soporte" ADD CONSTRAINT "ticket_soporte_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

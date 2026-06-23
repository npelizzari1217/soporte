-- Migration: 20260623120000_init_tenant_schema
-- PR-08: DDL completo de la base de datos TENANT (database-per-tenant).
-- Cubre tarea 3.D.3: 11 modelos del módulo tickets-core.
--
-- Sin columna cliente_id: el cliente ES la base de datos (aislamiento físico).
-- Soft refs cross-DB (solicitante_id, asignado_id, autor_id, subido_por_id,
--   ciclo_vigente_id, usuario_id en usuario_tipos_ticket) referencian master.usuarios
--   o master.ciclos_vigentes. Sin FK: cross-DB imposible en Postgres.
--   Integridad validada en la capa de aplicación (use cases).
--
-- Constraints especiales (no expresables en Prisma schema):
--   - tipos_ticket.codigo: CHECK IN ('SOPORTE','COMPRAS','EDILICIA')
--   - archivos.tamano_bytes: CHECK > 0
--   - tickets.ciclo_id: partial INDEX WHERE ciclo_id IS NOT NULL
--   - tickets.asignado_id: partial INDEX WHERE asignado_id IS NOT NULL
--
-- NOTA: Esta migración requiere una instancia Postgres activa para aplicarse.
-- Aplicar con: DATABASE_URL_TENANT=<url> pnpm --dir backend run migrate:tenant
--
-- Ref spec: SPEC:tickets-core/Tablas TENANT, SPEC:_shared-audit-pattern

-- ─── TABLAS SIN DEPENDENCIAS DE FK ───────────────────────────────────────────

-- CreateTable: estados
CREATE TABLE "estados" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "codigo"     VARCHAR(50) NOT NULL,
    "nombre"     VARCHAR(100) NOT NULL,
    "color"      VARCHAR(20),
    "orden"      INTEGER     NOT NULL DEFAULT 0,
    "activo"     BOOLEAN     NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable: prioridades
CREATE TABLE "prioridades" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "codigo"     VARCHAR(50) NOT NULL,
    "nombre"     VARCHAR(100) NOT NULL,
    "color"      VARCHAR(20),
    "orden"      INTEGER     NOT NULL DEFAULT 0,
    "activo"     BOOLEAN     NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "prioridades_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tipos_ticket
-- CHECK en codigo se agrega más abajo como raw SQL.
CREATE TABLE "tipos_ticket" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "codigo"     VARCHAR(50) NOT NULL,
    "nombre"     VARCHAR(100) NOT NULL,
    "activo"     BOOLEAN     NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tipos_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tipo_operacion
CREATE TABLE "tipo_operacion" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "codigo"     VARCHAR(50) NOT NULL,
    "nombre"     VARCHAR(100) NOT NULL,
    "activo"     BOOLEAN     NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tipo_operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ciclos_cliente
-- ciclo_vigente_id es soft ref → master.ciclos_vigentes.id (sin FK cross-DB).
CREATE TABLE "ciclos_cliente" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "ciclo_vigente_id"  UUID        NOT NULL,
    "nombre"            VARCHAR(100) NOT NULL,
    "fecha_inicio"      DATE        NOT NULL,
    "fecha_fin"         DATE        NOT NULL,
    "activo"            BOOLEAN     NOT NULL DEFAULT true,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMPTZ,

    CONSTRAINT "ciclos_cliente_pkey" PRIMARY KEY ("id")
);

-- ─── TABLAS DE METADATA (sin FKs a entidades operativas) ─────────────────────

-- CreateTable: archivos
-- subido_por_id es soft ref → master.usuarios.id (sin FK cross-DB).
-- CHECK (tamano_bytes > 0) se agrega más abajo como raw SQL.
CREATE TABLE "archivos" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "storage_key"     TEXT         NOT NULL,
    "nombre_original" VARCHAR(255) NOT NULL,
    "mime_type"       VARCHAR(100) NOT NULL,
    "tamano_bytes"    BIGINT       NOT NULL,
    "subido_por_id"   UUID         NOT NULL,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"      TIMESTAMPTZ,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- ─── ENTIDAD CENTRAL (FK a catálogos) ────────────────────────────────────────

-- CreateTable: tickets
-- solicitante_id y asignado_id son soft refs → master.usuarios.id (sin FK cross-DB).
CREATE TABLE "tickets" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "numero"           VARCHAR(20)  NOT NULL,
    "titulo"           VARCHAR(255) NOT NULL,
    "descripcion"      TEXT,
    "tipo_id"          UUID         NOT NULL,
    "estado_id"        UUID         NOT NULL,
    "prioridad_id"     UUID         NOT NULL,
    "ciclo_id"         UUID,
    "solicitante_id"   UUID         NOT NULL,
    "asignado_id"      UUID,
    "fecha_vencimiento" DATE,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"       TIMESTAMPTZ,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- ─── TIMELINE (FK a tickets y catálogos) ─────────────────────────────────────

-- CreateTable: operaciones_ticket
-- autor_id es soft ref → master.usuarios.id (sin FK cross-DB).
CREATE TABLE "operaciones_ticket" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id"         UUID        NOT NULL,
    "tipo_operacion_id" UUID        NOT NULL,
    "descripcion"       TEXT,
    "estado_anterior_id" UUID,
    "estado_nuevo_id"   UUID,
    "autor_id"          UUID        NOT NULL,
    "metadata"          JSONB,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"        TIMESTAMPTZ,

    CONSTRAINT "operaciones_ticket_pkey" PRIMARY KEY ("id")
);

-- ─── TABLAS JOIN (FKs a archivos y entidades operativas, ON DELETE CASCADE) ───

-- CreateTable: archivos_ticket (N:M archivos ↔ tickets)
-- Sin soft delete: baja = eliminación física. ON DELETE CASCADE en ambos extremos.
CREATE TABLE "archivos_ticket" (
    "archivo_id"  UUID        NOT NULL,
    "ticket_id"   UUID        NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_ticket_pkey" PRIMARY KEY ("archivo_id","ticket_id")
);

-- CreateTable: archivos_operacion (N:M archivos ↔ operaciones_ticket)
-- Sin soft delete: ON DELETE CASCADE en ambos extremos.
CREATE TABLE "archivos_operacion" (
    "archivo_id"   UUID        NOT NULL,
    "operacion_id" UUID        NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_operacion_pkey" PRIMARY KEY ("archivo_id","operacion_id")
);

-- CreateTable: usuario_tipos_ticket (elegibilidad de asignación)
-- usuario_id es soft ref → master.usuarios.id (sin FK cross-DB).
-- tipo_ticket_id tiene FK real → tipos_ticket.id (misma DB tenant).
-- Sin soft delete: baja = eliminación física.
CREATE TABLE "usuario_tipos_ticket" (
    "usuario_id"     UUID        NOT NULL,
    "tipo_ticket_id" UUID        NOT NULL,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_tipos_ticket_pkey" PRIMARY KEY ("usuario_id","tipo_ticket_id")
);

-- ─── UNIQUE INDEXES ───────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "estados_codigo_key" ON "estados"("codigo");

CREATE UNIQUE INDEX "prioridades_codigo_key" ON "prioridades"("codigo");

CREATE UNIQUE INDEX "tipos_ticket_codigo_key" ON "tipos_ticket"("codigo");

CREATE UNIQUE INDEX "tipo_operacion_codigo_key" ON "tipo_operacion"("codigo");

CREATE UNIQUE INDEX "tickets_numero_key" ON "tickets"("numero");

CREATE UNIQUE INDEX "archivos_storage_key_key" ON "archivos"("storage_key");

-- ─── REGULAR INDEXES ──────────────────────────────────────────────────────────

-- ciclos_cliente
CREATE INDEX "ciclos_cliente_ciclo_vigente_id_idx" ON "ciclos_cliente"("ciclo_vigente_id");
CREATE INDEX "ciclos_cliente_activo_idx" ON "ciclos_cliente"("activo");

-- tickets
CREATE INDEX "tickets_tipo_id_idx" ON "tickets"("tipo_id");
CREATE INDEX "tickets_estado_id_idx" ON "tickets"("estado_id");
CREATE INDEX "tickets_prioridad_id_idx" ON "tickets"("prioridad_id");
CREATE INDEX "tickets_solicitante_id_idx" ON "tickets"("solicitante_id");
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");

-- operaciones_ticket
CREATE INDEX "operaciones_ticket_ticket_id_idx" ON "operaciones_ticket"("ticket_id");
CREATE INDEX "operaciones_ticket_tipo_operacion_id_idx" ON "operaciones_ticket"("tipo_operacion_id");
CREATE INDEX "operaciones_ticket_autor_id_idx" ON "operaciones_ticket"("autor_id");

-- archivos_ticket
CREATE INDEX "archivos_ticket_ticket_id_idx" ON "archivos_ticket"("ticket_id");

-- usuario_tipos_ticket
CREATE INDEX "usuario_tipos_ticket_usuario_id_idx" ON "usuario_tipos_ticket"("usuario_id");

-- ─── PARTIAL INDEXES (no expresables en Prisma schema) ───────────────────────

-- tickets.ciclo_id: solo tickets con ciclo asignado (evita nulls en el índice)
CREATE INDEX "tickets_ciclo_id_idx" ON "tickets"("ciclo_id") WHERE "ciclo_id" IS NOT NULL;

-- tickets.asignado_id: solo tickets asignados (evita nulls en el índice)
CREATE INDEX "tickets_asignado_id_idx" ON "tickets"("asignado_id") WHERE "asignado_id" IS NOT NULL;

-- ─── CHECK CONSTRAINTS ────────────────────────────────────────────────────────

-- tipos_ticket.codigo: discriminador de flujo — solo 3 valores fijos del dominio
ALTER TABLE "tipos_ticket"
    ADD CONSTRAINT "tipos_ticket_codigo_check"
    CHECK ("codigo" IN ('SOPORTE', 'COMPRAS', 'EDILICIA'));

-- archivos.tamano_bytes: un archivo de 0 bytes es inválido
ALTER TABLE "archivos"
    ADD CONSTRAINT "archivos_tamano_check"
    CHECK ("tamano_bytes" > 0);

-- ─── FOREIGN KEYS ─────────────────────────────────────────────────────────────

-- tickets → tipos_ticket
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tipo_id_fkey"
    FOREIGN KEY ("tipo_id") REFERENCES "tipos_ticket"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- tickets → estados
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_estado_id_fkey"
    FOREIGN KEY ("estado_id") REFERENCES "estados"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- tickets → prioridades
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_prioridad_id_fkey"
    FOREIGN KEY ("prioridad_id") REFERENCES "prioridades"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- tickets → ciclos_cliente (nullable FK)
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ciclo_id_fkey"
    FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_cliente"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- operaciones_ticket → tickets
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- operaciones_ticket → tipo_operacion
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_tipo_operacion_id_fkey"
    FOREIGN KEY ("tipo_operacion_id") REFERENCES "tipo_operacion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- operaciones_ticket → estados (estado_anterior — named relation EstadoAnterior)
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_estado_anterior_id_fkey"
    FOREIGN KEY ("estado_anterior_id") REFERENCES "estados"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- operaciones_ticket → estados (estado_nuevo — named relation EstadoNuevo)
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_estado_nuevo_id_fkey"
    FOREIGN KEY ("estado_nuevo_id") REFERENCES "estados"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- archivos_ticket → archivos (ON DELETE CASCADE: borrar el archivo borra el join)
ALTER TABLE "archivos_ticket" ADD CONSTRAINT "archivos_ticket_archivo_id_fkey"
    FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- archivos_ticket → tickets (ON DELETE CASCADE: borrar el ticket borra el join)
ALTER TABLE "archivos_ticket" ADD CONSTRAINT "archivos_ticket_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- archivos_operacion → archivos (ON DELETE CASCADE)
ALTER TABLE "archivos_operacion" ADD CONSTRAINT "archivos_operacion_archivo_id_fkey"
    FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- archivos_operacion → operaciones_ticket (ON DELETE CASCADE)
ALTER TABLE "archivos_operacion" ADD CONSTRAINT "archivos_operacion_operacion_id_fkey"
    FOREIGN KEY ("operacion_id") REFERENCES "operaciones_ticket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- usuario_tipos_ticket → tipos_ticket (FK real — misma DB tenant)
ALTER TABLE "usuario_tipos_ticket" ADD CONSTRAINT "usuario_tipos_ticket_tipo_ticket_id_fkey"
    FOREIGN KEY ("tipo_ticket_id") REFERENCES "tipos_ticket"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
-- Nota: usuario_id NO tiene FK (soft ref → master.usuarios.id, cross-DB imposible en Postgres)

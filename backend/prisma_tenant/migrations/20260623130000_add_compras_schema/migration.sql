-- Migration: 20260623130000_add_compras_schema
-- PR-13a (tarea 4.C.3): DDL del módulo Compras en la base de datos TENANT.
-- Agrega 4 tablas: ticket_compra, items_compra, presupuestos, archivos_presupuesto.
--
-- ticket_compra: satélite 1:1 de tickets para tipo.codigo='COMPRAS'.
--   aprobado_por_id es soft ref → master.usuarios.id (sin FK cross-DB).
-- items_compra: ítems de la compra. CHECK (cantidad > 0).
-- presupuestos: cotizaciones de proveedores. CHECK (monto_total >= 0).
--   Invariante: solo un seleccionado=TRUE por ticket_compra_id (swap atómico en app).
-- archivos_presupuesto: join table archivos ↔ presupuestos. ON DELETE CASCADE.
--
-- Constraints especiales (no expresables en Prisma schema):
--   - items_compra.cantidad: CHECK > 0
--   - presupuestos.monto_total: CHECK >= 0
--
-- Ref spec: SPEC:compras/Tablas TENANT
-- Dependencia: migration 20260623120000_init_tenant_schema (tickets-core) debe existir.

-- ─── TICKET_COMPRA (satélite 1:1 de tickets para el flujo COMPRAS) ────────────
--
-- aprobado_por_id: soft ref → master.usuarios.id. Sin FK cross-DB.

CREATE TABLE "ticket_compra" (
    "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id"        UUID        NOT NULL,
    "aprobado_por_id"  UUID,
    "aprobado_en"      TIMESTAMPTZ,
    "motivo_rechazo"   TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"       TIMESTAMPTZ,

    CONSTRAINT "ticket_compra_pkey" PRIMARY KEY ("id")
);

-- ─── ITEMS_COMPRA ────────────────────────────────────────────────────────────

CREATE TABLE "items_compra" (
    "id"                   UUID           NOT NULL DEFAULT gen_random_uuid(),
    "ticket_compra_id"     UUID           NOT NULL,
    "descripcion"          VARCHAR(255)   NOT NULL,
    "cantidad"             NUMERIC(10, 2) NOT NULL,
    "unidad"               VARCHAR(50),
    "precio_unitario_ref"  NUMERIC(14, 2),
    "observaciones"        TEXT,
    "created_at"           TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"           TIMESTAMPTZ,

    CONSTRAINT "items_compra_pkey" PRIMARY KEY ("id")
);

-- ─── PRESUPUESTOS ─────────────────────────────────────────────────────────────

CREATE TABLE "presupuestos" (
    "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
    "ticket_compra_id" UUID           NOT NULL,
    "proveedor"        VARCHAR(255)   NOT NULL,
    "monto_total"      NUMERIC(14, 2) NOT NULL,
    "moneda"           VARCHAR(10)    NOT NULL DEFAULT 'ARS',
    "fecha_cotizacion" DATE           NOT NULL,
    "seleccionado"     BOOLEAN        NOT NULL DEFAULT FALSE,
    "observaciones"    TEXT,
    "created_at"       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"       TIMESTAMPTZ,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- ─── ARCHIVOS_PRESUPUESTO (join N:M archivos ↔ presupuestos) ─────────────────
--
-- Sin soft delete: ON DELETE CASCADE en ambos extremos.
-- PK compuesta (archivo_id, presupuesto_id).

CREATE TABLE "archivos_presupuesto" (
    "archivo_id"     UUID        NOT NULL,
    "presupuesto_id" UUID        NOT NULL,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_presupuesto_pkey" PRIMARY KEY ("archivo_id", "presupuesto_id")
);

-- ─── UNIQUE INDEXES ───────────────────────────────────────────────────────────

-- ticket_compra.ticket_id: garantiza relación 1:1 con tickets
CREATE UNIQUE INDEX "ticket_compra_ticket_id_key" ON "ticket_compra"("ticket_id");

-- ─── REGULAR INDEXES ──────────────────────────────────────────────────────────

-- items_compra
CREATE INDEX "items_compra_ticket_compra_id_idx" ON "items_compra"("ticket_compra_id");

-- presupuestos
CREATE INDEX "presupuestos_ticket_compra_id_idx" ON "presupuestos"("ticket_compra_id");

-- archivos_presupuesto
CREATE INDEX "archivos_presupuesto_presupuesto_id_idx" ON "archivos_presupuesto"("presupuesto_id");

-- ─── CHECK CONSTRAINTS ────────────────────────────────────────────────────────

-- items_compra.cantidad: cantidad requerida debe ser positiva
ALTER TABLE "items_compra"
    ADD CONSTRAINT "items_compra_cantidad_check"
    CHECK ("cantidad" > 0);

-- presupuestos.monto_total: no puede ser negativo (0 es válido para cotizaciones de servicios)
ALTER TABLE "presupuestos"
    ADD CONSTRAINT "presupuestos_monto_total_check"
    CHECK ("monto_total" >= 0);

-- ─── FOREIGN KEYS ─────────────────────────────────────────────────────────────

-- ticket_compra → tickets (1:1 satélite)
ALTER TABLE "ticket_compra" ADD CONSTRAINT "ticket_compra_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- items_compra → ticket_compra
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_ticket_compra_id_fkey"
    FOREIGN KEY ("ticket_compra_id") REFERENCES "ticket_compra"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- presupuestos → ticket_compra
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_ticket_compra_id_fkey"
    FOREIGN KEY ("ticket_compra_id") REFERENCES "ticket_compra"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- archivos_presupuesto → archivos (ON DELETE CASCADE)
ALTER TABLE "archivos_presupuesto" ADD CONSTRAINT "archivos_presupuesto_archivo_id_fkey"
    FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- archivos_presupuesto → presupuestos (ON DELETE CASCADE)
ALTER TABLE "archivos_presupuesto" ADD CONSTRAINT "archivos_presupuesto_presupuesto_id_fkey"
    FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: 20260701000000_add_configuracion_runtime_audit
-- Change: runtime-config-table — PR1 (fundaciones)
-- Ref design: §4, §11. Ref spec: §0. Tarea: 1.1
--
-- Tabla genérica de config operativa key-value (Opción A, primer corte
-- categoria='smtp') + audit log inmutable de cambios. Mismo shape en
-- prisma_master y prisma_tenant (ver migración espejo en prisma_tenant/).
--
-- Idempotencia (DoD §9 CLAUDE.md — esta es la PRIMERA migración de este repo
-- que agrega tablas nuevas fuera de la migración inicial; usa guards
-- IF NOT EXISTS para ser segura de re-correr):
--   CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- Constraints especiales (no expresables en Prisma @@unique — Dz9 design):
--   configuracion_runtime.(categoria, clave): PARTIAL UNIQUE INDEX
--     WHERE deleted_at IS NULL (mismo patrón que clientes.cuit). Con
--     soft-delete, @@unique de Prisma chocaría con filas borradas —
--     lookups por findFirst, NUNCA findUnique (Dz9).
--
-- audit_entries NO tiene updated_at/deleted_at (Dz8, inmutable por diseño —
-- un log de auditoría soft-eliminable/mutable deja de ser evidencia).

-- ─── CreateTable: configuracion_runtime ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "configuracion_runtime" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "categoria"       VARCHAR(50) NOT NULL,
    "clave"           VARCHAR(100) NOT NULL,
    "valor"           TEXT NOT NULL,
    "tipo"            VARCHAR(20) NOT NULL,
    "es_secreto"      BOOLEAN NOT NULL DEFAULT false,
    "iv"              VARCHAR(64),
    "auth_tag"        VARCHAR(64),
    "actualizado_por" UUID,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"      TIMESTAMPTZ,

    CONSTRAINT "configuracion_runtime_pkey" PRIMARY KEY ("id")
);

-- ─── CreateTable: audit_entries ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "audit_entries" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id"       UUID NOT NULL,
    "accion"         VARCHAR(50) NOT NULL,
    "categoria"      VARCHAR(50) NOT NULL,
    "clave"          VARCHAR(100) NOT NULL,
    "valor_anterior" TEXT,
    "valor_nuevo"    TEXT,
    "es_secreto"     BOOLEAN NOT NULL DEFAULT false,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- ─── CreateIndex ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "configuracion_runtime_categoria_idx"
  ON "configuracion_runtime" ("categoria");

-- Partial UNIQUE (Dz9) — permite múltiples filas soft-deleted con la misma
-- (categoria, clave), pero solo UNA activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS "configuracion_runtime_categoria_clave_key"
  ON "configuracion_runtime" ("categoria", "clave") WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "audit_entries_categoria_clave_idx"
  ON "audit_entries" ("categoria", "clave");

CREATE INDEX IF NOT EXISTS "audit_entries_created_at_idx"
  ON "audit_entries" ("created_at");

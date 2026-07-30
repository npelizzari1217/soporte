-- Migration: 20260701000000_add_configuracion_runtime_audit
-- Change: runtime-config-table — PR1 (fundaciones)
-- Ref design: §4, §11. Ref spec: §0. Tarea: 1.2
--
-- Espejo EXACTO de la migración master homónima (mismo shape en ambos
-- schemas). Aplicada a cada tenant DB vía `MigrateTenantsRunner`
-- (`backend/scripts/migrate-tenants.runner.ts`) tras el deploy — no en boot.
--
-- Idempotencia: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS —
-- segura de re-correr en TODAS las tenant DBs (DoD §9 CLAUDE.md).
--
-- configuracion_runtime.(categoria, clave): PARTIAL UNIQUE INDEX
--   WHERE deleted_at IS NULL (Dz9 design — @@unique de Prisma no expresa
--   partial unique; lookups por findFirst, NUNCA findUnique).
-- audit_entries: sin updated_at/deleted_at (Dz8, inmutable por diseño).
--
-- CHECK es_secreto→iv/auth_tag (Judgment Day PR1 Ronda 1, WARNING confirmado,
-- espejo EXACTO del guard en la migración master homónima): una fila con
-- es_secreto=true DEBE tener iv/auth_tag NOT NULL — sin este guard el schema
-- permitiría persistir un "secreto" sin cifrar. Parte de la propia CREATE
-- TABLE (idempotente vía el mismo IF NOT EXISTS de la tabla).

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

    CONSTRAINT "configuracion_runtime_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuracion_runtime_secreto_iv_auth_tag_check"
      CHECK (("es_secreto" = false) OR ("iv" IS NOT NULL AND "auth_tag" IS NOT NULL))
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

CREATE UNIQUE INDEX IF NOT EXISTS "configuracion_runtime_categoria_clave_key"
  ON "configuracion_runtime" ("categoria", "clave") WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "audit_entries_categoria_clave_idx"
  ON "audit_entries" ("categoria", "clave");

CREATE INDEX IF NOT EXISTS "audit_entries_created_at_idx"
  ON "audit_entries" ("created_at");

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
--
-- CHECK es_secreto→iv/auth_tag (Judgment Day PR1 Ronda 1, WARNING confirmado):
-- una fila con es_secreto=true DEBE tener iv/auth_tag NOT NULL — sin este
-- guard, el schema permitiría persistir un "secreto" sin cifrar (iv/auth_tag
-- nulos), inconsistente con el contrato de `ISecretCipher`. Expresado como
-- parte de la propia CREATE TABLE (no una migración ALTER separada) para
-- mantenerlo idempotente vía el mismo `IF NOT EXISTS` de la tabla.
--
-- NOTA de idempotencia (Judgment Day PR1 Ronda 2): `CREATE TABLE IF NOT
-- EXISTS` es un no-op si la tabla YA existe — NO agrega el CHECK a una tabla
-- creada por una corrida PREVIA de esta misma migración (pre-fix, sin el
-- CHECK). Cualquier DB que haya corrido esta migración ANTES de que este
-- guard se agregara debe verificarse a mano (`\d configuracion_runtime` /
-- consultar `pg_constraint`) y, si falta, recrear la tabla o agregar el
-- CHECK vía `ALTER TABLE ... ADD CONSTRAINT` manual — este archivo por sí
-- solo NO lo corrige retroactivamente.
--
-- audit_entries.actor_id: SIN FK a "usuarios" — ver nota en su CREATE TABLE
-- más abajo (intencional, espeja tenant).

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
--
-- actor_id SIN FK a "usuarios" (que en master SÍ existe): sacrificio DELIBERADO
-- de integridad referencial para mantener el shape IDÉNTICO entre master y
-- tenant (en tenant, "usuarios" vive en master — cross-DB, imposible expresar
-- FK física). Se prioriza el mismo DDL/mismo modelo Prisma en ambos schemas
-- por sobre la FK que master sí podría tener. No agregar la FK acá sin
-- también resolver cómo el espejo tenant la reemplazaría.
--
-- CONTRATO DE SECRETOS EN AUDIT (Judgment Day PR1 Ronda 2, forward-risk —
-- REQUISITO DURO para PR3, ver design Dz7): a diferencia de
-- configuracion_runtime, esta tabla NO tiene columnas iv/auth_tag. Para filas
-- con es_secreto=true, "valor_anterior"/"valor_nuevo" DEBEN guardar el valor
-- ENMASCARADO (ej. "***"), NUNCA el secreto en claro NI cifrado — el audit no
-- es un vault, es un log. Hoy (PR1) no existe writer que inserte en esta
-- tabla (es PR3); este comentario es el contrato autoritativo que ese writer
-- DEBE cumplir. Deliberadamente SIN CHECK de DB que fuerce NULL para
-- es_secreto=true: el enmascarado válido ES un string NOT NULL (ej. "***"),
-- así que un guard "es_secreto ⇒ NULL" rompería el masking en vez de
-- exigirlo — no hay forma barata de expresar "valor enmascarado, no
-- plaintext" como CHECK de Postgres sin acoplarlo al formato exacto del
-- masking. La verificación real queda para el Judgment Day de PR3 (cero
-- plaintext de secreto en el audit).

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

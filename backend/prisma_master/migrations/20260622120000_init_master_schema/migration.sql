-- Migration: 20260622120000_init_master_schema
-- PR-03: DDL completo de la base de datos MASTER.
-- Cubre tareas 1.C.3 (clientes, ciclos_vigentes) y 2.C.3 (usuarios, refresh_tokens, RBAC).
--
-- NOTA: Esta migración requiere una instancia Postgres activa para aplicarse.
-- Aplicar con: pnpm --dir backend run migrate:master
-- (requiere DATABASE_URL_MASTER apuntando a la DB master).
--
-- Constraints especiales (no expresables en Prisma schema):
--   - clientes.cuit: partial UNIQUE WHERE cuit IS NOT NULL
--   - ciclos_vigentes: CHECK (fecha_fin > fecha_inicio)
--   - usuarios.activo: partial INDEX WHERE deleted_at IS NULL

-- ─── TABLAS SIN DEPENDENCIAS (clientes, ciclos_vigentes, roles, permisos) ─────

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(255) NOT NULL,
    "razon_social" VARCHAR(255),
    "cuit" VARCHAR(13),
    "db_name" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_vigentes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(100) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ciclos_vigentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- ─── TABLAS CON FK A CLIENTES ─────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "cliente_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- ─── TABLAS CON FK A USUARIOS ─────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- ─── TABLAS JOIN N:M ──────────────────────────────────────────────────────────
-- Sin soft delete: la baja es eliminación física de la fila de asociación.

-- CreateTable
CREATE TABLE "roles_permisos" (
    "rol_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "usuarios_roles" (
    "usuario_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_roles_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- ─── UNIQUE INDEXES ───────────────────────────────────────────────────────────

-- CreateIndex
CREATE UNIQUE INDEX "clientes_db_name_key" ON "clientes"("db_name");

-- CreateIndex (partial UNIQUE — permite múltiples NULLs en cuit)
CREATE UNIQUE INDEX "clientes_cuit_key" ON "clientes"("cuit") WHERE "cuit" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- ─── REGULAR INDEXES ──────────────────────────────────────────────────────────

-- CreateIndex
CREATE INDEX "clientes_activo_idx" ON "clientes"("activo");

-- CreateIndex
CREATE INDEX "ciclos_vigentes_activo_idx" ON "ciclos_vigentes"("activo");

-- CreateIndex
CREATE INDEX "ciclos_vigentes_fecha_inicio_fecha_fin_idx" ON "ciclos_vigentes"("fecha_inicio", "fecha_fin");

-- CreateIndex
CREATE INDEX "usuarios_cliente_id_idx" ON "usuarios"("cliente_id");

-- CreateIndex (partial — solo usuarios activos no eliminados)
CREATE INDEX "usuarios_activo_idx" ON "usuarios"("activo") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "refresh_tokens"("usuario_id");

-- CreateIndex
CREATE INDEX "roles_permisos_permiso_id_idx" ON "roles_permisos"("permiso_id");

-- CreateIndex
CREATE INDEX "usuarios_roles_rol_id_idx" ON "usuarios_roles"("rol_id");

-- ─── CHECK CONSTRAINTS ────────────────────────────────────────────────────────

-- AddCheckConstraint (fecha_fin debe ser posterior a fecha_inicio)
ALTER TABLE "ciclos_vigentes"
    ADD CONSTRAINT "ciclos_vigentes_dates_check" CHECK ("fecha_fin" > "fecha_inicio");

-- ─── FOREIGN KEYS ─────────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_rol_id_fkey"
    FOREIGN KEY ("rol_id") REFERENCES "roles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_permiso_id_fkey"
    FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_rol_id_fkey"
    FOREIGN KEY ("rol_id") REFERENCES "roles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

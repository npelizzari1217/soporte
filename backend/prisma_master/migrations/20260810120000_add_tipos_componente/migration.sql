-- Migration: 20260810120000_add_tipos_componente
-- PR1 — sdd/tipos-componente-master (proyecto soporte)
--
-- Catálogo MASTER de tipos de componente (CPU, RAM, DISCO, etc.), dueño
-- único de la fuente de verdad de `codigo`. Distinto del catálogo tenant
-- `tipos_componente` (read-only, sembrado en provisioning por
-- TenantSeederAdapter) — la reconciliación entre ambos catálogos queda
-- fuera de alcance de PR1.
--
-- Sin `deleted_at`: a diferencia del resto del schema master, este catálogo
-- NO soft-elimina filas — la baja lógica es exclusivamente vía
-- `activo=false`.
--
-- Hand-authored: no había DB master local disponible en este entorno para
-- correr `prisma migrate dev` (P1001, localhost:5432 inalcanzable). Formato
-- calcado de las migraciones `CreateTable`/`CreateIndex` existentes
-- (ver 20260805105221_init_master y 20260807183248_add_usuario_cliente_modulos).

-- CreateTable
CREATE TABLE "tipos_componente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tipos_componente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_componente_codigo_key" ON "tipos_componente"("codigo");

-- CreateIndex
CREATE INDEX "tipos_componente_activo_idx" ON "tipos_componente"("activo");

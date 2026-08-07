-- CreateTable
CREATE TABLE "usuario_cliente_modulos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "modulo" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_cliente_modulos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usuario_cliente_modulos_usuario_id_cliente_id_idx" ON "usuario_cliente_modulos"("usuario_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_cliente_modulos_usuario_id_cliente_id_modulo_key" ON "usuario_cliente_modulos"("usuario_id", "cliente_id", "modulo");

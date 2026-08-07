-- CreateTable
CREATE TABLE "sla_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prioridad_id" UUID NOT NULL,
    "horas" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "sla_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sla_config_prioridad_id_key" ON "sla_config"("prioridad_id");

-- AddForeignKey
ALTER TABLE "sla_config" ADD CONSTRAINT "sla_config_prioridad_id_fkey" FOREIGN KEY ("prioridad_id") REFERENCES "prioridades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Ref: comentario en prisma_tenant/schema.prisma junto a sla_config.horas.
ALTER TABLE "sla_config" ADD CONSTRAINT "sla_config_horas_check" CHECK ("horas" > 0);

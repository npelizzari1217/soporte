-- Reconstrucción del dominio de Compras (PR-2, sdd/redisenio-modulo-compras).
-- Reemplaza el modelo legacy demolido en PR-1 (20260813120000_drop_compras)
-- con `compras` / `items_compra` / `operaciones_compra`. Ver
-- sdd/redisenio-modulo-compras (spec/design) para la tabla de verdad de
-- estados y los ADRs. CHECKs probados en el spec colocado
-- `prisma_tenant/compras-checks.integration.spec.ts` (H6, sdd/redisenio-modulo-compras/tasks).

-- CreateTable
CREATE TABLE "compras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" VARCHAR(20) NOT NULL,
    "fecha_solicitud" DATE NOT NULL,
    "motivo" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "solicitante_id" UUID NOT NULL,
    "ciclo_id" UUID NOT NULL,
    "cancelada_en" TIMESTAMPTZ,
    "cancelado_por_id" UUID,
    "motivo_cancelacion" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compra_id" UUID NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "proveedor" VARCHAR(255) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "moneda" VARCHAR(10) NOT NULL DEFAULT 'ARS',
    "fecha_cotizacion" DATE NOT NULL,
    "observaciones" TEXT,
    "estado_aprobacion" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "decidido_por_id" UUID,
    "decidido_en" TIMESTAMPTZ,
    "cantidad_comprada" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cantidad_entregada" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cerrado_con_faltante" BOOLEAN NOT NULL DEFAULT false,
    "motivo_cierre_faltante" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "items_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- SIN updated_at NI deleted_at: bitácora append-only (ADR-C4), expresión
-- ESTRUCTURAL que complementa la firma del puerto (crear/listarPorCompra,
-- sin update/delete — S37, verificado en PR-12).
CREATE TABLE "operaciones_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compra_id" UUID NOT NULL,
    "item_compra_id" UUID,
    "tipo" VARCHAR(40) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "detalle" TEXT NOT NULL,
    "datos" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operaciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compras_numero_key" ON "compras"("numero");

-- CreateIndex
CREATE INDEX "compras_ciclo_id_idx" ON "compras"("ciclo_id");

-- CreateIndex
CREATE INDEX "compras_solicitante_id_idx" ON "compras"("solicitante_id");

-- CreateIndex
CREATE INDEX "compras_created_at_idx" ON "compras"("created_at");

-- CreateIndex
-- Parcial (Prisma no expresa índices parciales en el schema declarativo —
-- ver cabecera de prisma_tenant/schema.prisma). Cubre la consulta operativa
-- "compras canceladas" sin indexar las filas NOT NULL, que son la mayoría.
CREATE INDEX "compras_cancelada_en_idx" ON "compras"("cancelada_en") WHERE "cancelada_en" IS NOT NULL;

-- CreateIndex
CREATE INDEX "items_compra_compra_id_idx" ON "items_compra"("compra_id");

-- CreateIndex
CREATE INDEX "items_compra_compra_id_estado_aprobacion_idx" ON "items_compra"("compra_id", "estado_aprobacion");

-- CreateIndex
CREATE INDEX "operaciones_compra_compra_id_created_at_idx" ON "operaciones_compra"("compra_id", "created_at");

-- CreateIndex
CREATE INDEX "operaciones_compra_item_compra_id_idx" ON "operaciones_compra"("item_compra_id");

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_item_compra_id_fkey" FOREIGN KEY ("item_compra_id") REFERENCES "items_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Ref: comentarios en prisma_tenant/schema.prisma junto a cada columna.
-- Probados uno por uno en prisma_tenant/compras-checks.integration.spec.ts (H6).

-- compras: cancelación atómica — los 3 campos son todos NULL (no cancelada)
-- o todos NOT NULL (cancelada). Ningún estado intermedio es válido.
ALTER TABLE "compras" ADD CONSTRAINT "compras_cancelacion_atomica_check" CHECK (
    ("cancelada_en" IS NULL AND "cancelado_por_id" IS NULL AND "motivo_cancelacion" IS NULL)
    OR
    ("cancelada_en" IS NOT NULL AND "cancelado_por_id" IS NOT NULL AND "motivo_cancelacion" IS NOT NULL)
);

-- items_compra: cantidad solicitada estrictamente positiva.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_check" CHECK ("cantidad" > 0);

-- items_compra: monto no negativo (0 es válido — cotización a costo cero).
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_monto_check" CHECK ("monto" >= 0);

-- items_compra: lo comprado nunca es negativo ni excede lo solicitado.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_comprada_check" CHECK (
    "cantidad_comprada" >= 0 AND "cantidad_comprada" <= "cantidad"
);

-- items_compra: lo entregado nunca es negativo ni excede lo comprado.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_entregada_check" CHECK (
    "cantidad_entregada" >= 0 AND "cantidad_entregada" <= "cantidad_comprada"
);

-- items_compra: catálogo cerrado de la máquina de decisión de UN paso.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_estado_aprobacion_check" CHECK (
    "estado_aprobacion" IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')
);

-- items_compra: catálogo cerrado de monedas soportadas (ADR-C7).
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_moneda_check" CHECK (
    "moneda" IN ('ARS', 'USD', 'EUR')
);

-- items_compra: decisión atómica — PENDIENTE ⟺ decidido_por_id/decidido_en
-- ambos NULL; APROBADO o RECHAZADO ⟺ ambos NOT NULL (ADR-C6: el campo
-- también se escribe en el rechazo, no solo en la aprobación).
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_decision_atomica_check" CHECK (
    ("estado_aprobacion" = 'PENDIENTE' AND "decidido_por_id" IS NULL AND "decidido_en" IS NULL)
    OR
    ("estado_aprobacion" != 'PENDIENTE' AND "decidido_por_id" IS NOT NULL AND "decidido_en" IS NOT NULL)
);

-- items_compra: cierre por faltante atómico — el flag y su motivo van juntos.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_faltante_atomico_check" CHECK (
    ("cerrado_con_faltante" = false AND "motivo_cierre_faltante" IS NULL)
    OR
    ("cerrado_con_faltante" = true AND "motivo_cierre_faltante" IS NOT NULL)
);

-- items_compra: solo se puede cerrar con faltante un ítem APROBADO.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_faltante_solo_aprobado_check" CHECK (
    NOT "cerrado_con_faltante" OR "estado_aprobacion" = 'APROBADO'
);

-- operaciones_compra: catálogo CERRADO de 10 valores, uno por cada comando
-- mutador del agregado (ADR-C4/ADR-C2). Sin tabla de catálogo (ADR-C7): este
-- set no es editable por el admin del tenant.
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_tipo_check" CHECK ("tipo" IN (
    'CREACION',
    'ITEM_AGREGADO',
    'ITEM_EDITADO',
    'ITEM_ELIMINADO',
    'ITEM_APROBADO',
    'ITEM_RECHAZADO',
    'COMPRA_REGISTRADA',
    'ENTREGA_REGISTRADA',
    'ITEM_CERRADO_CON_FALTANTE',
    'CANCELACION'
));

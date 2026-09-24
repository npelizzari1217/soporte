-- Migration: 20260924130000_feriados_cliente
-- WU3a — sdd/feriados-configurables, issue #216. Ref design D1.
--
-- Excepción por cliente al calendario global de feriados: una tabla por
-- tenant, sin `cliente_id` (el tenant ES la base de datos) y sin soft
-- delete (D1 — a diferencia de una entidad con identidad de negocio propia,
-- una fila soft-deleted seguiría ocupando el UNIQUE de `fecha`).
--
-- `fecha` es DATE (no timestamptz): un feriado es un día completo, sin
-- hora. TRAMPA para quien lea esta columna vía Prisma: vuelve como
-- medianoche UTC del día calendario — ver el comentario en schema.prisma
-- (mismo criterio que la tabla `feriados` de MASTER,
-- prisma_master/schema.prisma:492-498). El UNIQUE en `fecha` ya sirve de
-- índice de rango.

-- CreateTable
CREATE TABLE "feriados_cliente" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha"       DATE NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feriados_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feriados_cliente_fecha_key" ON "feriados_cliente"("fecha");

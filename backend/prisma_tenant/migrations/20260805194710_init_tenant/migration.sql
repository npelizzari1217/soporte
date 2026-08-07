-- CreateTable
CREATE TABLE "estados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prioridades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "prioridades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tipos_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_operacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tipo_operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ciclo_vigente_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ciclos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" VARCHAR(20) NOT NULL,
    "titulo" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "tipo_id" UUID NOT NULL,
    "estado_id" UUID NOT NULL,
    "prioridad_id" UUID NOT NULL,
    "ciclo_id" UUID,
    "ticket_referencia_id" UUID,
    "solicitante_id" UUID NOT NULL,
    "asignado_id" UUID,
    "sla_vence_at" TIMESTAMPTZ,
    "vencido" BOOLEAN NOT NULL DEFAULT false,
    "fecha_cierre" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operaciones_ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "tipo_operacion_id" UUID NOT NULL,
    "descripcion" TEXT,
    "estado_anterior_id" UUID,
    "estado_nuevo_id" UUID,
    "autor_id" UUID NOT NULL,
    "es_interno" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "operaciones_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "nombre_original" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "tamano_bytes" BIGINT NOT NULL,
    "subido_por_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos_ticket" (
    "archivo_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_ticket_pkey" PRIMARY KEY ("archivo_id","ticket_id")
);

-- CreateTable
CREATE TABLE "archivos_operacion" (
    "archivo_id" UUID NOT NULL,
    "operacion_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_operacion_pkey" PRIMARY KEY ("archivo_id","operacion_id")
);

-- CreateTable
CREATE TABLE "usuario_tipos_ticket" (
    "usuario_id" UUID NOT NULL,
    "tipo_ticket_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_tipos_ticket_pkey" PRIMARY KEY ("usuario_id","tipo_ticket_id")
);

-- CreateTable
CREATE TABLE "ticket_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "aprobado_por_id" UUID,
    "aprobado_en" TIMESTAMPTZ,
    "motivo_rechazo" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ticket_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_compra_id" UUID NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "unidad" VARCHAR(50),
    "precio_unitario_ref" DECIMAL(14,2),
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "items_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_compra_id" UUID NOT NULL,
    "proveedor" VARCHAR(255) NOT NULL,
    "monto_total" DECIMAL(14,2) NOT NULL,
    "moneda" VARCHAR(10) NOT NULL DEFAULT 'ARS',
    "fecha_cotizacion" DATE NOT NULL,
    "seleccionado" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos_presupuesto" (
    "archivo_id" UUID NOT NULL,
    "presupuesto_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_presupuesto_pkey" PRIMARY KEY ("archivo_id","presupuesto_id")
);

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "padre_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_edilicia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "ubicacion_id" UUID NOT NULL,
    "personal_asignado_id" UUID,
    "porcentaje_avance" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ticket_edilicia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtareas_edilicia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id" UUID NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "completada_en" TIMESTAMPTZ,
    "completada_por_id" UUID,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "subtareas_edilicia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_componente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tipos_componente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos_informaticos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(255) NOT NULL,
    "numero_serie" VARCHAR(255),
    "marca" VARCHAR(100),
    "modelo" VARCHAR(100),
    "fecha_adquisicion" DATE,
    "ubicacion_id" UUID,
    "asignado_a_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "equipos_informaticos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componentes_equipo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipo_id" UUID NOT NULL,
    "tipo_componente_id" UUID NOT NULL,
    "descripcion" VARCHAR(255),
    "numero_serie" VARCHAR(255),
    "capacidad" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "componentes_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos_equipo" (
    "archivo_id" UUID NOT NULL,
    "equipo_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_equipo_pkey" PRIMARY KEY ("archivo_id","equipo_id")
);

-- CreateTable
CREATE TABLE "ticket_soporte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "equipo_id" UUID,
    "descripcion_problema" TEXT,
    "solucion_aplicada" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ticket_soporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_articulos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" VARCHAR(255) NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo_ticket_id" UUID,
    "autor_id" UUID,
    "visible_para_solicitante" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "kb_articulos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estados_codigo_key" ON "estados"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "prioridades_codigo_key" ON "prioridades"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_ticket_codigo_key" ON "tipos_ticket"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_operacion_codigo_key" ON "tipo_operacion"("codigo");

-- CreateIndex
CREATE INDEX "ciclos_cliente_ciclo_vigente_id_idx" ON "ciclos_cliente"("ciclo_vigente_id");

-- CreateIndex
CREATE INDEX "ciclos_cliente_activo_idx" ON "ciclos_cliente"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_numero_key" ON "tickets"("numero");

-- CreateIndex
CREATE INDEX "tickets_tipo_id_idx" ON "tickets"("tipo_id");

-- CreateIndex
CREATE INDEX "tickets_estado_id_idx" ON "tickets"("estado_id");

-- CreateIndex
CREATE INDEX "tickets_prioridad_id_idx" ON "tickets"("prioridad_id");

-- CreateIndex (parcial — ver comentario tickets.cicloId en schema.prisma)
CREATE INDEX "tickets_ciclo_id_idx" ON "tickets"("ciclo_id") WHERE "ciclo_id" IS NOT NULL;

-- CreateIndex (parcial — ver comentario tickets.ticketReferenciaId en schema.prisma)
CREATE INDEX "tickets_ticket_referencia_id_idx" ON "tickets"("ticket_referencia_id") WHERE "ticket_referencia_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "tickets_solicitante_id_idx" ON "tickets"("solicitante_id");

-- CreateIndex (parcial — ver comentario tickets.asignadoId en schema.prisma)
CREATE INDEX "tickets_asignado_id_idx" ON "tickets"("asignado_id") WHERE "asignado_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");

-- CreateIndex
CREATE INDEX "tickets_vencido_idx" ON "tickets"("vencido");

-- CreateIndex
CREATE INDEX "operaciones_ticket_ticket_id_idx" ON "operaciones_ticket"("ticket_id");

-- CreateIndex
CREATE INDEX "operaciones_ticket_tipo_operacion_id_idx" ON "operaciones_ticket"("tipo_operacion_id");

-- CreateIndex
CREATE INDEX "operaciones_ticket_autor_id_idx" ON "operaciones_ticket"("autor_id");

-- CreateIndex
CREATE INDEX "operaciones_ticket_es_interno_idx" ON "operaciones_ticket"("es_interno");

-- CreateIndex
CREATE UNIQUE INDEX "archivos_storage_key_key" ON "archivos"("storage_key");

-- CreateIndex
CREATE INDEX "archivos_ticket_ticket_id_idx" ON "archivos_ticket"("ticket_id");

-- CreateIndex
CREATE INDEX "usuario_tipos_ticket_usuario_id_idx" ON "usuario_tipos_ticket"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_compra_ticket_id_key" ON "ticket_compra"("ticket_id");

-- CreateIndex
CREATE INDEX "items_compra_ticket_compra_id_idx" ON "items_compra"("ticket_compra_id");

-- CreateIndex
CREATE INDEX "presupuestos_ticket_compra_id_idx" ON "presupuestos"("ticket_compra_id");

-- CreateIndex
CREATE INDEX "archivos_presupuesto_presupuesto_id_idx" ON "archivos_presupuesto"("presupuesto_id");

-- CreateIndex (parcial — ver comentario ubicaciones.padreId en schema.prisma)
CREATE INDEX "ubicaciones_padre_id_idx" ON "ubicaciones"("padre_id") WHERE "padre_id" IS NOT NULL;

-- CreateIndex (parcial — ver comentario ubicaciones.activo en schema.prisma)
CREATE INDEX "ubicaciones_activo_idx" ON "ubicaciones"("activo") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ticket_edilicia_ticket_id_key" ON "ticket_edilicia"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_edilicia_ubicacion_id_idx" ON "ticket_edilicia"("ubicacion_id");

-- CreateIndex
CREATE INDEX "ticket_edilicia_porcentaje_avance_idx" ON "ticket_edilicia"("porcentaje_avance");

-- CreateIndex
CREATE INDEX "subtareas_edilicia_ticket_edilicia_id_idx" ON "subtareas_edilicia"("ticket_edilicia_id");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_componente_codigo_key" ON "tipos_componente"("codigo");

-- CreateIndex (único parcial — ver comentario equipos_informaticos.numeroSerie en schema.prisma)
CREATE UNIQUE INDEX "equipos_informaticos_numero_serie_key" ON "equipos_informaticos"("numero_serie") WHERE "numero_serie" IS NOT NULL;

-- CreateIndex
CREATE INDEX "equipos_informaticos_ubicacion_id_idx" ON "equipos_informaticos"("ubicacion_id");

-- CreateIndex
CREATE INDEX "equipos_informaticos_asignado_a_id_idx" ON "equipos_informaticos"("asignado_a_id");

-- CreateIndex
CREATE INDEX "componentes_equipo_equipo_id_idx" ON "componentes_equipo"("equipo_id");

-- CreateIndex
CREATE INDEX "componentes_equipo_tipo_componente_id_idx" ON "componentes_equipo"("tipo_componente_id");

-- CreateIndex
CREATE INDEX "archivos_equipo_equipo_id_idx" ON "archivos_equipo"("equipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_soporte_ticket_id_key" ON "ticket_soporte"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_soporte_equipo_id_idx" ON "ticket_soporte"("equipo_id");

-- CreateIndex
CREATE INDEX "kb_articulos_tipo_ticket_id_idx" ON "kb_articulos"("tipo_ticket_id");

-- CreateIndex
CREATE INDEX "kb_articulos_visible_para_solicitante_idx" ON "kb_articulos"("visible_para_solicitante");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_prioridad_id_fkey" FOREIGN KEY ("prioridad_id") REFERENCES "prioridades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_referencia_id_fkey" FOREIGN KEY ("ticket_referencia_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_tipo_operacion_id_fkey" FOREIGN KEY ("tipo_operacion_id") REFERENCES "tipo_operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_estado_anterior_id_fkey" FOREIGN KEY ("estado_anterior_id") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_ticket" ADD CONSTRAINT "operaciones_ticket_estado_nuevo_id_fkey" FOREIGN KEY ("estado_nuevo_id") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_ticket" ADD CONSTRAINT "archivos_ticket_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_ticket" ADD CONSTRAINT "archivos_ticket_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_operacion" ADD CONSTRAINT "archivos_operacion_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_operacion" ADD CONSTRAINT "archivos_operacion_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operaciones_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_tipos_ticket" ADD CONSTRAINT "usuario_tipos_ticket_tipo_ticket_id_fkey" FOREIGN KEY ("tipo_ticket_id") REFERENCES "tipos_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_compra" ADD CONSTRAINT "ticket_compra_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_ticket_compra_id_fkey" FOREIGN KEY ("ticket_compra_id") REFERENCES "ticket_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_ticket_compra_id_fkey" FOREIGN KEY ("ticket_compra_id") REFERENCES "ticket_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_presupuesto" ADD CONSTRAINT "archivos_presupuesto_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_presupuesto" ADD CONSTRAINT "archivos_presupuesto_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtareas_edilicia" ADD CONSTRAINT "subtareas_edilicia_ticket_edilicia_id_fkey" FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos_informaticos" ADD CONSTRAINT "equipos_informaticos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componentes_equipo" ADD CONSTRAINT "componentes_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componentes_equipo" ADD CONSTRAINT "componentes_equipo_tipo_componente_id_fkey" FOREIGN KEY ("tipo_componente_id") REFERENCES "tipos_componente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_equipo" ADD CONSTRAINT "archivos_equipo_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_equipo" ADD CONSTRAINT "archivos_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_soporte" ADD CONSTRAINT "ticket_soporte_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_soporte" ADD CONSTRAINT "ticket_soporte_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articulos" ADD CONSTRAINT "kb_articulos_tipo_ticket_id_fkey" FOREIGN KEY ("tipo_ticket_id") REFERENCES "tipos_ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Ref: comentarios en prisma_tenant/schema.prisma junto a cada columna.
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_tamano_bytes_check" CHECK ("tamano_bytes" > 0);

ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_check" CHECK ("cantidad" > 0);

ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_monto_total_check" CHECK ("monto_total" >= 0);

ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_porcentaje_avance_check" CHECK ("porcentaje_avance" >= 0 AND "porcentaje_avance" <= 100);

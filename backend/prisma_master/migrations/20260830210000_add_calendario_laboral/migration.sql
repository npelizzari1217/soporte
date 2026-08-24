-- Migration: 20260830210000_add_calendario_laboral
-- WU-1 — sdd/sla-habil (proyecto soporte)
--
-- Calendario laboral global (una sola configuración compartida por todos los
-- tenants) y feriados de día completo, para el cálculo de SLA en horas
-- hábiles. Ver ADR-1/ADR-4 y REQ-1/REQ-2 en sdd/sla-habil/design.
--
-- `calendario_laboral_dias`: 7 filas FIJAS, sembradas por la migración
-- `seed_calendario_laboral_default`. El ABM (WU-6) solo hace UPDATE — nunca
-- INSERT ni DELETE.
--
-- Ventana SEMIABIERTA `[apertura, cierre)`: el instante de cierre ya es fuera
-- de horario (REQ-6). El CHECK garantiza el invariante del calendario:
-- ambos extremos NULL (día cerrado), o ambos NOT NULL con
-- 0 <= apertura < cierre <= 1440 (minutos desde la medianoche local).
--
-- `feriados.fecha` es DATE (no timestamptz): un feriado es un día completo,
-- sin hora. TRAMPA para quien lea esta columna vía Prisma: vuelve como
-- medianoche UTC del día calendario — ver el comentario en schema.prisma y
-- en el mapper (WU-4). El UNIQUE en `fecha` ya sirve de índice de rango.

-- CreateTable
CREATE TABLE "calendario_laboral_dias" (
    "dia_semana"      SMALLINT NOT NULL,
    "apertura_minuto" SMALLINT,
    "cierre_minuto"   SMALLINT,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL,

    CONSTRAINT "calendario_laboral_dias_pkey" PRIMARY KEY ("dia_semana"),
    CONSTRAINT "calendario_laboral_dias_dia_semana_check"
      CHECK ("dia_semana" BETWEEN 0 AND 6),
    CONSTRAINT "calendario_laboral_dias_ventana_check" CHECK (
      ("apertura_minuto" IS NULL AND "cierre_minuto" IS NULL) OR
      ("apertura_minuto" IS NOT NULL AND "cierre_minuto" IS NOT NULL
       AND "apertura_minuto" >= 0 AND "cierre_minuto" <= 1440
       AND "apertura_minuto" < "cierre_minuto")
    )
);

-- CreateTable
CREATE TABLE "feriados" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha"       DATE NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feriados_fecha_key" ON "feriados"("fecha");

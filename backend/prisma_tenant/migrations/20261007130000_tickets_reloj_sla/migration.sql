-- sdd/sla-primera-respuesta-y-pausa WU-3a (M2): reloj de SLA por tiempo activo.
-- Los tickets EXISTENTES no se recalculan: sla_acumulado_s y sla_corre_desde quedan
-- en NULL ("ticket previo, todavia no incorporado"; ADR-1). Por eso cada DEFAULT se
-- pone en un SEGUNDO paso: agregar la columna con DEFAULT rellenaria las filas viejas.
-- Prisma resuelve sus @default del lado del cliente; el DDL y el schema son dos
-- fuentes espejadas y un test de deriva las compara.
ALTER TABLE "tickets" ADD COLUMN "sla_acumulado_s" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "sla_meta_s" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "sla_corre_desde" TIMESTAMPTZ;
ALTER TABLE "tickets" ADD COLUMN "sla_reloj_seq_hasta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "sla_reloj_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "sla_reloj_pendiente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN "sla_cumplido" BOOLEAN;

ALTER TABLE "tickets" ALTER COLUMN "sla_acumulado_s" SET DEFAULT 0;
ALTER TABLE "tickets" ALTER COLUMN "sla_corre_desde" SET DEFAULT now();

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_acumulado_s_check"
    CHECK ("sla_acumulado_s" IS NULL OR "sla_acumulado_s" >= 0);
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_meta_s_check"
    CHECK ("sla_meta_s" IS NULL OR "sla_meta_s" > 0);

CREATE INDEX "tickets_sla_reloj_pendiente_idx" ON "tickets" ("id") WHERE "sla_reloj_pendiente";

-- Secuencia por ticket estampada por el marcador bajo el lock de la fila (ADR-3).
ALTER TABLE "operaciones_ticket" ADD COLUMN "sla_reloj_seq" INTEGER;
CREATE INDEX "operaciones_ticket_ticket_id_sla_reloj_seq_idx"
    ON "operaciones_ticket" ("ticket_id", "sla_reloj_seq") WHERE "sla_reloj_seq" IS NOT NULL;

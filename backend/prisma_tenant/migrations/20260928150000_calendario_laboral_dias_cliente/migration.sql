-- Migration: 20260928150000_calendario_laboral_dias_cliente
-- WU-1 — sdd/horario-laboral-por-cliente. Ref design D1.
--
-- Horario semanal por cliente: mismo shape y mismos CHECK que la tabla
-- `calendario_laboral_dias` de MASTER (`prisma_master/schema.prisma:477-485`,
-- migración `20260830210000_add_calendario_laboral`). El horario que usa el
-- SLA HABIL deja de ser global y pasa a vivir por tenant, sin `cliente_id`
-- (el tenant ES la base de datos, mismo criterio que `feriados_cliente`).
--
-- Timestamp elegido a propósito por `20260928120000` (`add_password_reset_tokens`,
-- schema MASTER, ramas sin mergear): viven en directorios de schema distintos
-- y no chocan, pero el diseño lo deja anotado para quien lea el árbol.
--
-- `updated_at` no tiene DEFAULT (`@updatedAt` de Prisma solo actualiza en
-- UPDATE): el INSERT del seed lo setea explícito.
--
-- Seed: 9-18 lunes a viernes (540-1080 minutos), sábado y domingo cerrados —
-- el mismo default que la tabla master, para que el deploy no cambie ningún
-- `sla_vence_at` (H1/D3 del design). `ON CONFLICT DO NOTHING`: si la tabla ya
-- tuviera filas (no debería, es CREATE en la misma migración), el seed nunca
-- pisa una fila existente.

-- CreateTable
CREATE TABLE "calendario_laboral_dias_cliente" (
    "dia_semana"      SMALLINT NOT NULL,
    "apertura_minuto" SMALLINT,
    "cierre_minuto"   SMALLINT,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL,

    CONSTRAINT "calendario_laboral_dias_cliente_pkey" PRIMARY KEY ("dia_semana"),
    CONSTRAINT "calendario_laboral_dias_cliente_dia_semana_check"
      CHECK ("dia_semana" BETWEEN 0 AND 6),
    CONSTRAINT "calendario_laboral_dias_cliente_ventana_check" CHECK (
      ("apertura_minuto" IS NULL AND "cierre_minuto" IS NULL) OR
      ("apertura_minuto" IS NOT NULL AND "cierre_minuto" IS NOT NULL
       AND "apertura_minuto" >= 0 AND "cierre_minuto" <= 1440
       AND "apertura_minuto" < "cierre_minuto")
    )
);

-- Seed: default 9-18 lunes a viernes, sábado y domingo cerrados.
INSERT INTO "calendario_laboral_dias_cliente" ("dia_semana", "apertura_minuto", "cierre_minuto", "updated_at") VALUES
  (0, NULL, NULL, CURRENT_TIMESTAMP), (1, 540, 1080, CURRENT_TIMESTAMP),
  (2, 540, 1080, CURRENT_TIMESTAMP), (3, 540, 1080, CURRENT_TIMESTAMP),
  (4, 540, 1080, CURRENT_TIMESTAMP), (5, 540, 1080, CURRENT_TIMESTAMP),
  (6, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("dia_semana") DO NOTHING;

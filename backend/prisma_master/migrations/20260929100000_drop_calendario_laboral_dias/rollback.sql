-- Rollback de 20260929100000_drop_calendario_laboral_dias.
--
-- Recrea la tabla tal como la dejaron 20260830210000_add_calendario_laboral y
-- 20260830210100_seed_calendario_laboral_default. Solo tiene sentido si también se
-- revierte el código de `horario-laboral-por-cliente`: el código vigente no la lee.
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

INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at) VALUES
  (0, NULL, NULL, CURRENT_TIMESTAMP),
  (1, 540, 1080, CURRENT_TIMESTAMP),
  (2, 540, 1080, CURRENT_TIMESTAMP),
  (3, 540, 1080, CURRENT_TIMESTAMP),
  (4, 540, 1080, CURRENT_TIMESTAMP),
  (5, 540, 1080, CURRENT_TIMESTAMP),
  (6, NULL, NULL, CURRENT_TIMESTAMP);

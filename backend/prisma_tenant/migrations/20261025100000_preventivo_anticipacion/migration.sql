-- odd/preventivo-anticipacion T1: anticipacion del plan preventivo (S1, S5, S6).
-- El ticket de un ciclo se genera `anticipacion` antes de la fecha del ciclo.
-- - anticipacion_valor: entero >= 0. DEFAULT 0 = comportamiento previo (S5): los planes que ya
--   existen generan el dia del ciclo, como hasta ahora.
-- - anticipacion_unidad: mismo catalogo que intervalo_unidad (DIAS, MESES). La lista del CHECK se
--   compara contra UNIDADES_INTERVALO en preventivo-schema.integration.spec.ts.
-- - anticipacion estrictamente menor que la cadencia, comparadas en dias con un mes = 30 (mismo
--   criterio que PlanPreventivoEntity, que es la autoridad: este CHECK es backstop).
ALTER TABLE "planes_preventivo" ADD COLUMN "anticipacion_valor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "planes_preventivo" ADD COLUMN "anticipacion_unidad" VARCHAR(10) NOT NULL DEFAULT 'DIAS';

ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_anticipacion_valor_check" CHECK (
    "anticipacion_valor" >= 0
);

ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_anticipacion_unidad_check" CHECK (
    "anticipacion_unidad" IN ('DIAS', 'MESES')
);

ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_anticipacion_menor_cadencia_check" CHECK (
    (CASE WHEN "anticipacion_unidad" = 'MESES' THEN "anticipacion_valor" * 30 ELSE "anticipacion_valor" END)
    <
    (CASE WHEN "intervalo_unidad" = 'MESES' THEN "intervalo_valor" * 30 ELSE "intervalo_valor" END)
);

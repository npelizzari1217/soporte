-- odd/edilicia-obra-externa T1a: modalidad de ejecucion del ticket (S1).
-- - modalidad: INTERNA (tecnicos propios, el comportamiento de siempre) o EXTERNA (contratista).
--   NOT NULL con DEFAULT 'INTERNA': las filas existentes quedan en INTERNA y nada cambia para ellas.
--   El @default del schema Prisma espeja este DEFAULT; tocar uno exige tocar el otro.
-- - El CHECK se compara contra MODALIDADES_TICKET en tickets-modalidad.integration.spec.ts.
ALTER TABLE "tickets" ADD COLUMN "modalidad" VARCHAR(10) NOT NULL DEFAULT 'INTERNA';
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_modalidad_check" CHECK ("modalidad" IN ('INTERNA', 'EXTERNA'));

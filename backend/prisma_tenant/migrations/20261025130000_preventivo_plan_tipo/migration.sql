-- odd/preventivo-por-tipo T1: tipo de ticket del plan preventivo (S2, S3).
-- - tipo_id: tipo de los tickets que genera el plan; decide tambien quien ve, crea, edita y da de
--   baja el plan (S4). Cualquier tipo del catalogo (S2).
-- - Backfill (S3): todo plan existente, incluidos los dados de baja, queda en el tipo PREVENTIVO,
--   que es el que el barrido usaba para todos hasta ahora: generan lo mismo que antes.
-- - Un tenant con planes y sin el tipo PREVENTIVO no se puede migrar sin elegir un tipo a mano: la
--   migracion falla con un mensaje que lo dice, en vez de dejar planes sin tipo. Un tenant sin
--   planes migra igual, tenga o no el tipo.
-- - FK RESTRICT, como tickets.tipo_id: la baja de un tipo es logica (deleted_at), asi que un tipo
--   con planes no se borra fisicamente.
ALTER TABLE "planes_preventivo" ADD COLUMN "tipo_id" UUID;

DO $$
DECLARE
    tipo_preventivo UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM "planes_preventivo" WHERE "tipo_id" IS NULL) THEN
        SELECT "id" INTO tipo_preventivo FROM "tipos_ticket" WHERE "codigo" = 'PREVENTIVO';
        IF tipo_preventivo IS NULL THEN
            RAISE EXCEPTION 'preventivo_plan_tipo: el tenant tiene planes preventivos y no tiene el tipo de ticket PREVENTIVO. Crear el tipo con codigo PREVENTIVO, o asignar tipo_id a mano a cada plan, y volver a migrar.';
        END IF;
        UPDATE "planes_preventivo" SET "tipo_id" = tipo_preventivo WHERE "tipo_id" IS NULL;
    END IF;
END $$;

ALTER TABLE "planes_preventivo" ALTER COLUMN "tipo_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_tipo_id_fkey"
    FOREIGN KEY ("tipo_id") REFERENCES "tipos_ticket"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Listado por los tipos que ve el actor (S1).
CREATE INDEX "planes_preventivo_tipo_id_idx" ON "planes_preventivo" ("tipo_id");

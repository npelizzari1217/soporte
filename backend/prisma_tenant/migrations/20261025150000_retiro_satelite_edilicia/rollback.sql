-- Rollback de 20261025150000_retiro_satelite_edilicia. Re-ejecutable.
--
-- Recrea `ticket_edilicia`, `comentarios_reparacion` y `reparacion_compra` con el DDL que tenían al
-- borrarse, y las vuelve a llenar como proyección del ticket, que es la fuente desde 20261024120000:
-- - `ticket_edilicia`: una fila por ticket de un tipo del módulo EDILICIA (MANTENIMIENTO incluido),
--   sin ubicación, porque la ubicación vive en el ticket;
-- - `reparacion_compra`: los vínculos de `ticket_compra` de esos tickets, con su id y fecha.
--
-- Límites:
-- - `comentarios_reparacion` vuelve VACÍA: los comentarios están en el timeline del ticket como
--   comentarios internos y no se distinguen de uno hecho desde el ticket.
-- - Los ids de los satélites son nuevos: nada fuera de estas tablas los referenciaba.
-- - Solo hace falta para volver a código anterior a T4a (`6595d838` o antes). El código de T4a en
--   adelante no usa estas tablas.
-- - Correr este archivo no borra la fila de la migración en `_prisma_migrations`.

CREATE TABLE IF NOT EXISTS "ticket_edilicia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "ubicacion" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "ticket_edilicia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_edilicia_ticket_id_key" ON "ticket_edilicia"("ticket_id");
ALTER TABLE "ticket_edilicia" DROP CONSTRAINT IF EXISTS "ticket_edilicia_ticket_id_fkey";
ALTER TABLE "ticket_edilicia" ADD CONSTRAINT "ticket_edilicia_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "comentarios_reparacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "autor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_reparacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "comentarios_reparacion_ticket_created_at_idx"
    ON "comentarios_reparacion"("ticket_edilicia_id", "created_at");
ALTER TABLE "comentarios_reparacion" DROP CONSTRAINT IF EXISTS "comentarios_reparacion_ticket_edilicia_id_fkey";
ALTER TABLE "comentarios_reparacion" ADD CONSTRAINT "comentarios_reparacion_ticket_edilicia_id_fkey"
    FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comentarios_reparacion" DROP CONSTRAINT IF EXISTS "comentarios_reparacion_texto_check";
ALTER TABLE "comentarios_reparacion" ADD CONSTRAINT "comentarios_reparacion_texto_check" CHECK (
    char_length(btrim("texto")) BETWEEN 1 AND 2000
);

CREATE TABLE IF NOT EXISTS "reparacion_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reparacion_compra_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reparacion_compra_ticket_compra_key"
    ON "reparacion_compra"("ticket_edilicia_id", "compra_id");
ALTER TABLE "reparacion_compra" DROP CONSTRAINT IF EXISTS "reparacion_compra_ticket_edilicia_id_fkey";
ALTER TABLE "reparacion_compra" ADD CONSTRAINT "reparacion_compra_ticket_edilicia_id_fkey"
    FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reparacion_compra" DROP CONSTRAINT IF EXISTS "reparacion_compra_compra_id_fkey";
ALTER TABLE "reparacion_compra" ADD CONSTRAINT "reparacion_compra_compra_id_fkey"
    FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ticket_edilicia" ("ticket_id", "created_at", "updated_at")
SELECT t."id", t."created_at", now()
  FROM "tickets" t
  JOIN "tipos_ticket" tt ON tt."id" = t."tipo_id"
 WHERE tt."modulo" = 'EDILICIA'
ON CONFLICT ("ticket_id") DO NOTHING;

INSERT INTO "reparacion_compra" ("id", "ticket_edilicia_id", "compra_id", "created_at")
SELECT tc."id", te."id", tc."compra_id", tc."created_at"
  FROM "ticket_compra" tc
  JOIN "ticket_edilicia" te ON te."ticket_id" = tc."ticket_id"
ON CONFLICT DO NOTHING;

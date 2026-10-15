-- odd/ubicacion-sector-ticket T1: Ubicacion (texto libre) y Sector opcionales en todo ticket.
-- - ubicacion: VARCHAR(255) nullable, sin backfill. Es otra columna que ticket_edilicia.ubicacion,
--   que Edilicia conserva tal cual.
-- - sector_id: FK nullable a sectores, sin backfill. ON DELETE RESTRICT, mismo criterio que
--   compras.sector_id: un sector usado se desactiva, no se borra. Indice parcial: la mayoria de
--   los tickets no lleva sector.
ALTER TABLE "tickets" ADD COLUMN "ubicacion" VARCHAR(255);
ALTER TABLE "tickets" ADD COLUMN "sector_id" UUID;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sector_id_fkey"
    FOREIGN KEY ("sector_id") REFERENCES "sectores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tickets_sector_id_idx" ON "tickets"("sector_id") WHERE "sector_id" IS NOT NULL;

-- odd/preventivo-anticipacion T2: fecha objetivo del ticket (S2).
-- - fecha_objetivo: DATE nullable, sin backfill. La fija el barrido preventivo con la fecha del ciclo
--   del plan (el ticket puede generarse antes, por la anticipacion). Es informativa: no participa
--   del SLA. NULL en todo ticket que no sale de un plan preventivo, y en los preventivos previos.
ALTER TABLE "tickets" ADD COLUMN "fecha_objetivo" DATE;

-- Rollback de 20261015140000_tiempos_habiles_tickets. Se puede correr dos veces.
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_primera_respuesta_habil_s_check";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_resolucion_habil_s_check";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "primera_respuesta_habil_s";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "resolucion_habil_s";

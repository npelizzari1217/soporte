-- Rollback de 20261003150000_tickets_solicitante_externo.
--
-- FALLA POR DISENO en el SET NOT NULL si ya existe algun ticket de un solicitante externo
-- (`solicitante_id` NULL): revertir obliga a una decision manual, borrar o reasignar esos tickets.
-- Es la restriccion declarada en la propuesta. Despues de esto se puede revertir la WU-6.
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_solicitante_exactamente_uno";
DROP INDEX IF EXISTS "tickets_solicitante_externo_id_idx";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_solicitante_externo_id_fkey";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "solicitante_externo_id";
ALTER TABLE "tickets" ALTER COLUMN "solicitante_id" SET NOT NULL;

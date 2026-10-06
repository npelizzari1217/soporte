-- issue #429: marca de "meta de SLA pendiente de aplicar". La escribe el alta y la repriorizacion del
-- ticket (en la misma escritura que persiste el ticket / el cambio de prioridad) y la limpia
-- AplicarSla con el CAS del reloj. Si la aplicacion falla (conflicto del CAS, calendario, base) la marca
-- queda y el barrido de SLA reaplica la meta con la prioridad vigente. Sin relleno: los tickets
-- existentes quedan en false (la aplicacion que fallo antes de esta migracion no es recuperable).
-- El DEFAULT false es espejo del @default de Prisma.
ALTER TABLE "tickets" ADD COLUMN "sla_meta_pendiente" BOOLEAN NOT NULL DEFAULT false;

-- Indice parcial del barrido: solo las filas marcadas.
CREATE INDEX "tickets_sla_meta_pendiente_idx" ON "tickets" ("id") WHERE "sla_meta_pendiente";

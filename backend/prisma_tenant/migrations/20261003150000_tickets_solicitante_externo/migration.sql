-- sdd/formulario-publico-qr (WU-7, ADR-6 pasos 2 a 4): el ticket puede ser de un solicitante externo.
-- `solicitante_id` pasa a admitir NULL (solo metadata) y se suma `solicitante_externo_id` con FK
-- RESTRICT a `solicitantes_externos`. El CHECK exige exactamente uno de los dos; las filas
-- existentes tienen todas `solicitante_id` NOT NULL, asi que lo cumplen.
ALTER TABLE "tickets" ALTER COLUMN "solicitante_id" DROP NOT NULL;

ALTER TABLE "tickets" ADD COLUMN "solicitante_externo_id" UUID;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_solicitante_externo_id_fkey"
  FOREIGN KEY ("solicitante_externo_id") REFERENCES "solicitantes_externos" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tickets_solicitante_externo_id_idx"
  ON "tickets" ("solicitante_externo_id") WHERE "solicitante_externo_id" IS NOT NULL;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_solicitante_exactamente_uno"
  CHECK (("solicitante_id" IS NULL) <> ("solicitante_externo_id" IS NULL));

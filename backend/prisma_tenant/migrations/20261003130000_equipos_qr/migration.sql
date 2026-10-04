-- sdd/formulario-publico-qr (WU-4, ADR-10): QR por equipo con token opaco.
-- Aditiva y sin backfill: las dos columnas son nullable y ninguna fila existente se modifica.
-- Solo se guarda el sha256 hex (64 caracteres) del token; el token en claro nunca se persiste.
ALTER TABLE "equipos_informaticos"
  ADD COLUMN "qr_token_hash" VARCHAR(64),
  ADD COLUMN "qr_emitido_at" TIMESTAMPTZ;

-- UNIQUE nullable: varios equipos sin QR conviven (NULL no choca con NULL).
CREATE UNIQUE INDEX "equipos_informaticos_qr_token_hash_key"
  ON "equipos_informaticos" ("qr_token_hash");

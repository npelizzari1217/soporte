-- sdd/formulario-publico-qr (WU-11, ADR-7): token de verificacion del pedido publico.
-- Aditiva: tabla nueva, sin tocar las existentes.
-- Solo el sha256 del token (`token_hash`); NO hay datos personales en master (el nombre, el
-- email y la descripcion del pedido viven en `pedidos_publicos_pendientes`, en el tenant).
-- `id` es el mismo que el de la fila pendiente del tenant (soft ref, sin FK cross-DB).
-- `expires_at`: emision + 24 h (decision del dueño, aplicada en el dominio).
-- `used_at`: se marca post-commit, best-effort.
-- Los tokens de master no se barren, igual que `encuesta_tokens`.
CREATE TABLE "pedido_publico_tokens" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "cliente_id" UUID        NOT NULL,
  "token_hash" TEXT        NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at"    TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "pedido_publico_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pedido_publico_tokens_token_hash_key" ON "pedido_publico_tokens" ("token_hash");

CREATE INDEX "pedido_publico_tokens_cliente_id_idx" ON "pedido_publico_tokens" ("cliente_id");

ALTER TABLE "pedido_publico_tokens"
  ADD CONSTRAINT "pedido_publico_tokens_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

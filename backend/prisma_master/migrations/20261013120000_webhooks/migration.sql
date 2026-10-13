-- odd/webhooks (T1): destino de webhooks por cliente, en master. Aditiva: una tabla nueva, sin
-- backfill y sin seed. El backend aun no envia nada: solo existe el repositorio.

-- Un destino por cliente: `cliente_id` es la clave primaria (relacion 1:1 con `clientes`).
-- `secreto_cifrado` es el payload `v1:{iv}:{tag}:{ct}` de `AesGcmSecretCipher` con
-- `EMAIL_CRYPTO_KEY` y AAD `webhook:{cliente_id}`; lo re-cifra `scripts/rotar-email-crypto-key.mjs`.
-- `eventos` es un subconjunto de TICKET_CREADO, TICKET_ESTADO_CAMBIADO, TICKET_ASIGNADO y
-- TICKET_COMENTADO (valida el dominio).
CREATE TABLE "webhook_destinos" (
  "cliente_id"       UUID         NOT NULL,
  "url"              VARCHAR(2048) NOT NULL,
  "eventos"          TEXT[]       NOT NULL,
  "secreto_cifrado"  TEXT         NOT NULL,
  "activo"           BOOLEAN      NOT NULL DEFAULT true,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "webhook_destinos_pkey" PRIMARY KEY ("cliente_id")
);

-- Como `api_claves`: el destino no sobrevive al cliente.
ALTER TABLE "webhook_destinos"
  ADD CONSTRAINT "webhook_destinos_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Configuracion del asistente de IA por cliente (odd/asistente-ia-ayuda, T1).
--
-- Tabla 1:1 con `clientes`, como `webhook_destinos`: la fila existe si y solo si el cliente tiene IA
-- configurada, asi que el todo-o-nada lo garantiza la estructura (columnas NOT NULL) y no un CHECK.
-- Un cliente sin fila responde con la Ayuda directamente (modo de respaldo).
--
-- `clave_cifrada`: payload `v1:{iv}:{tag}:{ct}` de `AesGcmSecretCipher` con AAD `ia:{cliente_id}`.
-- La rotacion de `EMAIL_CRYPTO_KEY` la re-cifra (`scripts/rotar-email-crypto-key.mjs`, `DESTINOS`).
-- `verificado_at` registra el ultimo EXITO de "Probar"; `verificacion_error`, el ultimo motivo de
-- falla ya saneado (nunca la respuesta cruda del proveedor).
--
-- ADITIVA: no toca ninguna fila existente.

CREATE TABLE "asistente_ia_config" (
  "cliente_id"          UUID          NOT NULL,
  "url"                 VARCHAR(2048) NOT NULL,
  "modelo"              VARCHAR(100)  NOT NULL,
  "clave_cifrada"       TEXT          NOT NULL,
  "verificado_at"       TIMESTAMPTZ,
  "verificacion_error"  TEXT,
  "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ   NOT NULL,
  CONSTRAINT "asistente_ia_config_pkey" PRIMARY KEY ("cliente_id")
);

ALTER TABLE "asistente_ia_config"
  ADD CONSTRAINT "asistente_ia_config_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- sdd/api-publica (T1): modelo en master de la API publica. Aditiva: 2 columnas con default y
-- una tabla nueva, sin backfill y sin seed. El backend aun no consume nada de esto.

ALTER TABLE "clientes" ADD COLUMN "api_habilitada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "usuarios" ADD COLUMN "es_integracion" BOOLEAN NOT NULL DEFAULT false;

-- Claves de la API. Solo el sha256 de la clave completa; `prefijo` es la parte visible en la UI.
CREATE TABLE "api_claves" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "cliente_id"     UUID         NOT NULL,
  "usuario_id"     UUID         NOT NULL,
  "nombre"         VARCHAR(100) NOT NULL,
  "prefijo"        VARCHAR(20)  NOT NULL,
  "hash"           TEXT         NOT NULL,
  "permisos"       TEXT[]       NOT NULL,
  "creada_por_id"  UUID         NOT NULL,
  "creada_at"      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimo_uso_at"  TIMESTAMPTZ,
  "revocada_at"    TIMESTAMPTZ,
  CONSTRAINT "api_claves_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_claves_prefijo_key" ON "api_claves" ("prefijo");
CREATE UNIQUE INDEX "api_claves_hash_key" ON "api_claves" ("hash");
CREATE INDEX "api_claves_cliente_id_idx" ON "api_claves" ("cliente_id");
CREATE INDEX "api_claves_usuario_id_idx" ON "api_claves" ("usuario_id");

-- Cliente y usuario de integracion: la clave no sobrevive a ninguno. Creador: RESTRICT.
ALTER TABLE "api_claves"
  ADD CONSTRAINT "api_claves_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_claves"
  ADD CONSTRAINT "api_claves_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_claves"
  ADD CONSTRAINT "api_claves_creada_por_id_fkey"
  FOREIGN KEY ("creada_por_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

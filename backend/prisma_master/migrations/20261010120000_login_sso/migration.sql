-- sdd/login-sso (WU-1a, ADR-1): migracion M1 de master.
-- Aditiva: 2 tablas nuevas y un indice, sin backfill y sin seed.
-- NO se despliega sin la cadena completa de WU (el backend no consume nada de esto todavia).

-- Estado de un flujo SSO, de un solo uso y atado al navegador. Solo hashes de `state` y del
-- `bindingToken`; `nonce` y `code_verifier` se guardan crudos porque el IdP los pide.
CREATE TABLE "sso_estados" (
  "state_hash"     TEXT         NOT NULL,
  "proveedor"      VARCHAR(12)  NOT NULL,
  "nonce"          TEXT         NOT NULL,
  "code_verifier"  TEXT         NOT NULL,
  "navegador_hash" TEXT         NOT NULL,
  "siguiente"      VARCHAR(300),
  "expira_at"      TIMESTAMPTZ  NOT NULL,
  "usado_at"       TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sso_estados_pkey" PRIMARY KEY ("state_hash"),
  CONSTRAINT "sso_estados_proveedor_check"
    CHECK ("proveedor" IN ('GOOGLE', 'MICROSOFT'))
);

-- Vinculo inmutable (usuario, proveedor, sujeto). Borrar al usuario borra sus vinculos.
CREATE TABLE "usuarios_identidades_sso" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id"  UUID         NOT NULL,
  "proveedor"   VARCHAR(12)  NOT NULL,
  "subject"     VARCHAR(255) NOT NULL,
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usuarios_identidades_sso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usuarios_identidades_sso_proveedor_check"
    CHECK ("proveedor" IN ('GOOGLE', 'MICROSOFT'))
);

CREATE INDEX "sso_estados_expira_at_idx" ON "sso_estados" ("expira_at");
CREATE UNIQUE INDEX "usuarios_identidades_sso_usuario_id_proveedor_key"
  ON "usuarios_identidades_sso" ("usuario_id", "proveedor");
CREATE UNIQUE INDEX "usuarios_identidades_sso_proveedor_subject_key"
  ON "usuarios_identidades_sso" ("proveedor", "subject");

ALTER TABLE "usuarios_identidades_sso"
  ADD CONSTRAINT "usuarios_identidades_sso_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Busqueda del email sin distinguir mayusculas (ADR-5). No unico: `usuarios.email` sigue siendo
-- el unico exacto, y dos variantes de mayusculas se resuelven como ambiguas en el caso de uso.
CREATE INDEX "usuarios_email_lower_idx" ON "usuarios" (lower("email"));

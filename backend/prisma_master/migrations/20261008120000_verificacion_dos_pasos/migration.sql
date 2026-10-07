-- sdd/verificacion-dos-pasos (WU-1, ADR-3): migracion M1 de master.
-- Aditiva: 5 tablas nuevas y una columna con default, sin backfill.
-- NO se despliega sin la cadena completa de WU (el backend no consume nada de esto todavia).
--
-- Tablas propias y nunca columnas en `usuarios`: el upsert de `UsuarioEntity.save()` con una
-- lectura vieja pisaria el estado de 2FA (mismo motivo que `clientes.slug`).

-- Un secreto activo y/o uno pendiente por usuario. Activo = `secreto_cifrado IS NOT NULL`.
CREATE TABLE "usuarios_tfa" (
  "usuario_id"                UUID        NOT NULL,
  "secreto_cifrado"           TEXT,
  "confirmado_at"             TIMESTAMPTZ,
  "ultimo_paso"               INTEGER     NOT NULL DEFAULT 0,
  "secreto_pendiente_cifrado" TEXT,
  "pendiente_creado_at"       TIMESTAMPTZ,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMPTZ NOT NULL,
  CONSTRAINT "usuarios_tfa_pkey" PRIMARY KEY ("usuario_id"),
  CONSTRAINT "usuarios_tfa_activo_par_check"
    CHECK (("secreto_cifrado" IS NULL) = ("confirmado_at" IS NULL)),
  CONSTRAINT "usuarios_tfa_pendiente_par_check"
    CHECK (("secreto_pendiente_cifrado" IS NULL) = ("pendiente_creado_at" IS NULL))
);

CREATE TABLE "tfa_codigos_recuperacion" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id"  UUID        NOT NULL,
  "codigo_hash" TEXT        NOT NULL,
  "usado_at"    TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tfa_codigos_recuperacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tfa_dispositivos_confiables" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id"  UUID        NOT NULL,
  "token_hash"  TEXT        NOT NULL,
  "expira_at"   TIMESTAMPTZ NOT NULL,
  "revocado_at" TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tfa_dispositivos_confiables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_desafios" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id"    UUID        NOT NULL,
  "token_hash"    TEXT        NOT NULL,
  "proposito"     VARCHAR(12) NOT NULL,
  "verificado_at" TIMESTAMPTZ,
  "usado_at"      TIMESTAMPTZ,
  "expira_at"     TIMESTAMPTZ NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_desafios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_desafios_proposito_check"
    CHECK ("proposito" IN ('VERIFICAR', 'ENROLAR', 'SELECCIONAR'))
);

-- Sin FK: la clave de contrasena existe aunque el email no (no revela cuentas, I3).
CREATE TABLE "auth_intentos_fallidos" (
  "clave"          VARCHAR(200) NOT NULL,
  "fallos"         INTEGER      NOT NULL,
  "ventana_inicio" TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "auth_intentos_fallidos_pkey" PRIMARY KEY ("clave")
);

CREATE UNIQUE INDEX "tfa_dispositivos_confiables_token_hash_key" ON "tfa_dispositivos_confiables" ("token_hash");
CREATE UNIQUE INDEX "auth_desafios_token_hash_key" ON "auth_desafios" ("token_hash");
CREATE INDEX "tfa_codigos_recuperacion_usuario_id_idx" ON "tfa_codigos_recuperacion" ("usuario_id");
CREATE INDEX "tfa_dispositivos_confiables_usuario_id_idx" ON "tfa_dispositivos_confiables" ("usuario_id");
CREATE INDEX "auth_desafios_usuario_id_idx" ON "auth_desafios" ("usuario_id");

ALTER TABLE "usuarios_tfa"
  ADD CONSTRAINT "usuarios_tfa_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tfa_codigos_recuperacion"
  ADD CONSTRAINT "tfa_codigos_recuperacion_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tfa_dispositivos_confiables"
  ADD CONSTRAINT "tfa_dispositivos_confiables_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_desafios"
  ADD CONSTRAINT "auth_desafios_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Politica por cliente: default false (el DDL y Prisma coinciden), sin backfill.
ALTER TABLE "clientes" ADD COLUMN "requiere_2fa" BOOLEAN NOT NULL DEFAULT false;

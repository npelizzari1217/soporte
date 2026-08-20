-- Configuración SMTP por cliente (sdd/configuracion-correo-por-cliente, WU2).
--
-- POR QUÉ: hasta hoy el envío de correo usaba UNA sola identidad SMTP global
-- (env vars), compartida por todos los tenants. Esta migración agrega la
-- config por cliente en `clientes` (master) — NO en la DB de cada tenant, ya
-- que `clientes` YA es el catálogo cross-tenant y el envío se resuelve por
-- `TenantContext.clienteId` (ver design D3).
--
-- ADITIVA Y NULLABLE A PROPÓSITO: `clientes` en esta base (y en producción)
-- ya tiene filas reales. Ninguna columna nueva puede tener NOT NULL sin
-- DEFAULT, y esta migración NO toca ni borra ninguna fila existente — el
-- backfill de los clientes preexistentes es un script Node aparte
-- (`backfill-correo-clientes.mjs`, WU6) porque cifrar la contraseña requiere
-- Node, no Postgres.
--
-- Una sola columna TEXT para la contraseña cifrada: el payload
-- `v1:{iv}:{tag}:{ciphertext}` ya trae la versión adentro (ver
-- `AesGcmSecretCipher`, WU1). No se agregan columnas hermanas para iv/tag/
-- versión — así no pueden desincronizarse en un UPDATE parcial.
--
-- `smtp_config_updated_at` es una columna DISTINTA de `updated_at`: es la
-- revisión que usa el caché de transporters (WU5). Si reusáramos
-- `updated_at`, editar el nombre comercial del cliente invalidaría un
-- transporter que seguía funcionando.

-- AlterTable
ALTER TABLE "clientes"
    ADD COLUMN "smtp_host" VARCHAR(255),
    ADD COLUMN "smtp_port" INTEGER,
    ADD COLUMN "smtp_user" VARCHAR(255),
    ADD COLUMN "smtp_secure" BOOLEAN,
    ADD COLUMN "smtp_from" VARCHAR(255),
    ADD COLUMN "smtp_password_cifrada" TEXT,
    ADD COLUMN "smtp_config_updated_at" TIMESTAMPTZ,
    ADD COLUMN "smtp_verificado_at" TIMESTAMPTZ,
    ADD COLUMN "smtp_verificacion_error" TEXT;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Todo-o-nada: host/port/user/from/password_cifrada están juntos NULL (no
-- configurado) o juntos NOT NULL (configurado). "Configurado pero inusable"
-- queda imposible a nivel de storage, no solo en la capa de aplicación.
-- `smtp_secure` queda AFUERA a propósito: es un booleano, no participa del
-- "todo" configurado/no-configurado.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_smtp_config_todo_o_nada_check" CHECK (
    (
        "smtp_host" IS NULL AND "smtp_port" IS NULL AND "smtp_user" IS NULL
        AND "smtp_from" IS NULL AND "smtp_password_cifrada" IS NULL
    ) OR (
        "smtp_host" IS NOT NULL AND "smtp_port" IS NOT NULL AND "smtp_user" IS NOT NULL
        AND "smtp_from" IS NOT NULL AND "smtp_password_cifrada" IS NOT NULL
    )
);

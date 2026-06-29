-- Migration: 20260629120000_add_is_global_admin
-- Change B (tickets-rbac-4-roles) — PR3
-- ADR-4: is_global_admin flag para acceso cross-tenant.
-- ADR-5: revocación masiva de refresh tokens (force re-login con nuevos permisos).
--
-- Idempotencia: IF NOT EXISTS en ALTER TABLE; UPDATE con WHERE revoked_at IS NULL.

-- T3.8: columna is_global_admin en master.usuarios
-- DEFAULT FALSE garantiza que ningún usuario existente recibe acceso cross-tenant sin
-- una acción explícita (UPDATE SET is_global_admin = true por operación root).
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- T3.9: revocación masiva de refresh tokens
-- Los access tokens (≤15 min TTL) expiran solos; los refresh tokens revocados aquí
-- fuerzan re-login para que los nuevos JWTs incluyan los permisos RBAC actualizados.
-- WHERE revoked_at IS NULL AND deleted_at IS NULL garantiza idempotencia (segunda
-- ejecución no toca filas ya revocadas).
UPDATE refresh_tokens
  SET revoked_at = now()
  WHERE revoked_at IS NULL
    AND deleted_at IS NULL;

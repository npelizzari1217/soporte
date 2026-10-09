-- Rollback de 20261010120000_login_sso.
--
-- DESTRUCTIVO: borra los vinculos SSO de todos los usuarios y los estados de flujo en curso.
-- Quien entraba por Google o Microsoft vuelve a entrar solo con contrasena.
--
-- El codigo que usa estas tablas debe estar revertido ANTES de correr este rollback.
DROP INDEX IF EXISTS "usuarios_email_lower_idx";
DROP TABLE IF EXISTS "usuarios_identidades_sso";
DROP TABLE IF EXISTS "sso_estados";

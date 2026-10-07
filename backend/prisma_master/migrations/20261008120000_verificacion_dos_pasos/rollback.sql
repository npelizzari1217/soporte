-- Rollback de 20261008120000_verificacion_dos_pasos.
--
-- DESTRUCTIVO: borra los secretos TOTP, los codigos de recuperacion, los dispositivos
-- confiables, los desafios y la politica `requiere_2fa` de todos los clientes. Quien tenia
-- 2FA activo vuelve a entrar solo con contrasena.
--
-- El codigo que usa estas tablas debe estar revertido ANTES de correr este rollback.
DROP TABLE IF EXISTS "auth_intentos_fallidos";
DROP TABLE IF EXISTS "auth_desafios";
DROP TABLE IF EXISTS "tfa_dispositivos_confiables";
DROP TABLE IF EXISTS "tfa_codigos_recuperacion";
DROP TABLE IF EXISTS "usuarios_tfa";
ALTER TABLE "clientes" DROP COLUMN IF EXISTS "requiere_2fa";

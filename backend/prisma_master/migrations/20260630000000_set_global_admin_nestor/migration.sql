-- Migration: 20260630000000_set_global_admin_nestor
-- Change: admin-general — PR1 (seguridad)
-- ADR-7: Migración idempotente designa operador global inicial.
--
-- Idempotencia: UPDATE WHERE es no-op si ya es true o si el email no existe.
-- La columna is_global_admin ya existe (20260629120000_add_is_global_admin).
-- Localmente será no-op si nestor@sesitec.com.ar no existe en la DB dev.

UPDATE usuarios
SET is_global_admin = true
WHERE email = 'nestor@sesitec.com.ar';

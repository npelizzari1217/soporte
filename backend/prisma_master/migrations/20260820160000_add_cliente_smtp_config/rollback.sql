-- Rollback de 20260820160000_add_cliente_smtp_config.
--
-- DESTRUCTIVO: borra la configuración SMTP guardada de TODOS los clientes,
-- incluida la sembrada por el backfill (WU6) y la que ROOT haya cargado a
-- mano desde entonces. Antes de correr esto contra una base con datos
-- reales, respaldar la config:
--   \copy (SELECT id, smtp_host, smtp_port, smtp_user, smtp_secure, smtp_from, smtp_password_cifrada, smtp_config_updated_at, smtp_verificado_at, smtp_verificacion_error FROM clientes WHERE smtp_password_cifrada IS NOT NULL) TO 'clientes_smtp_backup.csv' CSV HEADER
--
-- El código que lee/escribe estas columnas (repositorio, use cases,
-- TenantAwareEmailSender) debe estar revertido ANTES de correr este
-- rollback — de lo contrario el binding de EMAIL_SENDER sigue esperando
-- columnas que ya no existen.
ALTER TABLE "clientes" DROP CONSTRAINT IF EXISTS "clientes_smtp_config_todo_o_nada_check";

ALTER TABLE "clientes"
    DROP COLUMN IF EXISTS "smtp_host",
    DROP COLUMN IF EXISTS "smtp_port",
    DROP COLUMN IF EXISTS "smtp_user",
    DROP COLUMN IF EXISTS "smtp_secure",
    DROP COLUMN IF EXISTS "smtp_from",
    DROP COLUMN IF EXISTS "smtp_password_cifrada",
    DROP COLUMN IF EXISTS "smtp_config_updated_at",
    DROP COLUMN IF EXISTS "smtp_verificado_at",
    DROP COLUMN IF EXISTS "smtp_verificacion_error";

-- Converge el schema declarado con la realidad de producción. WU-9
-- (sdd/matriz-permisos-por-usuario) ya había eliminado `roles_permisos`,
-- `permisos` y `usuario_cliente_modulos` de PRODUCCIÓN mediante un script
-- standalone (`scripts/drop-legacy-rbac-matriz-vieja.mjs --confirmar`), no
-- una migración de Prisma — así que `prisma_master/schema.prisma` seguía
-- declarando los 3 modelos y dev/test seguían creando esas tablas mientras
-- producción ya no las tenía.
--
-- IDEMPOTENTE a propósito (`DROP TABLE IF EXISTS`): en producción es un
-- no-op (las tablas ya no existen, el script de WU-9 las borró); en dev y
-- test es efectiva (las borra por primera vez, ya que ahí SÍ las crea la
-- migración de seed histórica).
--
-- Orden obligatorio: roles_permisos ANTES que permisos (roles_permisos
-- tiene FK a permisos; al revés, Postgres rechaza el DROP). Mismo orden que
-- `scripts/drop-legacy-rbac-matriz-vieja.sql`, que ya validó este orden
-- contra producción real.
--
-- `roles` y `membresias.rol_id` NO se tocan: el rol sigue existiendo como
-- identidad de membresía. Sin rollback.sql: irreversible (no hay INSERT
-- inverso posible una vez corrido — mismo motivo documentado en
-- `scripts/drop-legacy-rbac-matriz-vieja.mjs`); el único rollback real es un
-- restore de backup de la base master.
DROP TABLE IF EXISTS "roles_permisos";
DROP TABLE IF EXISTS "permisos";
DROP TABLE IF EXISTS "usuario_cliente_modulos";

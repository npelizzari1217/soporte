-- Migration: 20260914150000_sesion_utc_y_backfill_fechas
-- WU3 (sdd/sesion-utc-y-backfill-de-fechas), issue #173. Ref design ADR-1,
-- ADR-2, ADR-3, ADR-4. Ref tasks: 3.3.
--
-- Dos correcciones en UNA sola transacción (Prisma corre cada archivo de
-- migración dentro de su propia transacción; separarlas admitiría un
-- estado parcial —sesión ya en UTC, datos todavía sin corregir— que
-- ADR-5 prohíbe):
--
--   1. ALTER DATABASE ... SET timezone TO 'UTC' sobre la base ACTUAL
--      (segunda garantía de ADR-1, independiente de `conUtc()`: cubre
--      `psql`, el CLI de Prisma y cualquier conexión futura con otra URL).
--      `current_database()` hace el SQL agnóstico del nombre de la base
--      (los sufijos hex de tenant cambian). Requiere ser dueño de la base:
--      si el rol no lo es, Postgres devuelve `insufficient_privilege`
--      (SQLSTATE 42501) — se degrada a `RAISE WARNING`, nunca corta la
--      migración (mismo criterio que
--      `PostgresAdminService.setDatabaseTimezoneUtc`). La verificación
--      post-deploy (`SHOW timezone` en sesión nueva) queda en el runbook.
--
--   2. Backfill catalogado: recorre `information_schema` buscando toda
--      columna `timestamptz` de `public`, excluye `_prisma_migrations`
--      (la escribe el motor de migraciones, ajena al defecto) y le resta 3
--      horas a cada valor cuyo microsegundo (`EXTRACT(MICROSECONDS ...)
--      % 1000`) sea 0 — el discriminador de ADR-3: un `Date` de JS tiene
--      resolución de milisegundos, así que microsegundos % 1000 = 0
--      identifica, con certeza absoluta salvo un puñado de falsos
--      positivos esperados, un valor escrito por Prisma. Estructuralmente
--      NO puede tocar una columna `@db.Date` (`feriados.fecha`, hallazgo
--      #2542, fuera de alcance de este cambio): el filtro es
--      `udt_name = 'timestamptz'`, y `date` tiene otro `udt_name`.
--
-- EJECUTAR ESTE ARCHIVO DOS VECES CORROMPE LOS DATOS (ADR-4): restar 3h no
-- cambia los microsegundos, así que una segunda corrida vuelve a
-- identificar las mismas filas ya corregidas y les resta otras 3h. La
-- garantía de ejecución exactamente-una-vez es EXTERNA a este SQL —la da
-- `_prisma_migrations` (ADR-2, R4). NUNCA correr este archivo a mano con
-- `psql`; solo vía `prisma migrate deploy` / `migrate:master` /
-- `migrate:tenants`.

SET LOCAL TimeZone = 'UTC';

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING
      '[sesion-utc] ALTER DATABASE % SET timezone TO UTC fallo por insufficient_privilege (42501): el rol no es dueno de la base. La sesion sigue garantizada por conexion (conUtc). Ver verificacion post-deploy del runbook.',
      current_database();
END $$;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT col.table_name, col.column_name
      FROM information_schema.columns col
      JOIN information_schema.tables t
        ON t.table_schema = col.table_schema AND t.table_name = col.table_name
     WHERE col.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND col.udt_name = 'timestamptz'
       AND col.table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
        WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0',
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name);
  END LOOP;
END $$;

-- Migration: 20260914150000_sesion_utc_y_backfill_fechas
-- WU3 (sdd/sesion-utc-y-backfill-de-fechas), issue #173. Ref design ADR-1,
-- ADR-2, ADR-3, ADR-4. Ref tasks: 3.3.
--
-- CORRECCIÓN (review lineage `review-f4098720ccc4b038`, CRITICAL
-- `R3-r4-retry-path-unproved`): la cabecera original de este archivo decía
-- "Prisma corre cada archivo de migración dentro de su propia transacción".
-- Eso es FALSO — verificado de forma independiente: una sentencia que falla
-- a mitad de archivo puede dejar sentencias previas del MISMO archivo ya
-- commiteadas, no hay una transacción que envuelva el archivo entero. Las
-- dos correcciones de abajo siguen en un solo archivo por orden de deploy
-- (ADR-5), no por atomicidad de archivo. Ver ADR-2 en `design.md` para el
-- detalle completo y la guarda real de ejecución exactamente-una-vez.
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
-- identificar las mismas filas ya corregidas y les resta otras 3h.
--
-- EJECUCIÓN EXACTAMENTE-UNA-VEZ — DOS GUARDAS, NO UNA (ADR-2, R4,
-- corrección tras CRITICAL `R3-r4-retry-path-unproved`):
--   a) `_prisma_migrations` (motor de Prisma) cubre el camino ORDINARIO.
--   b) Tabla `_utc_backfill_aplicado`, escrita DENTRO del mismo DO $$ que
--      hace el backfill (mismo bloque = misma sentencia = misma
--      transacción implícita), cubre el camino FALLO-Y-REINTENTO: el DO $$
--      de más abajo es atómico por sí mismo, así que si commitea, el
--      marcador commitea junto con el desplazamiento de datos —
--      independientemente de si Prisma alcanza a escribir su propia fila
--      de bookkeeping en `_prisma_migrations` (esa escritura es una
--      operación SEPARADA, posterior). Si el proceso muere en el medio, un
--      reintento (`prisma migrate resolve` + `migrate deploy`) vuelve a
--      correr este archivo completo — sin (b), el discriminador de
--      microsegundos no cambia al restar horas y una fila ya corregida se
--      re-identifica como "escrita por Prisma" y se le resta otras 3h.
--      (b) es defensa en profundidad: NO reemplaza a (a), la complementa.
--
-- NUNCA correr este archivo a mano con `psql`; solo vía
-- `prisma migrate deploy` / `migrate:master` / `migrate:tenants`.
--
-- Nota sobre `SET LOCAL TimeZone`: esta migración NO fuerza el `TimeZone`
-- de la sesión antes de correr. No hace falta: `timestamptz - INTERVAL`
-- opera sobre el instante absoluto, y `EXTRACT(MICROSECONDS FROM ...)` lee
-- la parte de microsegundos del valor almacenado, ninguno de los dos
-- depende del `TimeZone` de sesión (ver ADR-4 en `design.md`). Un
-- `SET LOCAL` previo era además INERTE fuera de una transacción explícita
-- —si alguien corriera el archivo con `psql -f` (uso ya prohibido por este
-- comentario) Postgres emite `WARNING: SET LOCAL can only be used in
-- transaction blocks` porque cada sentencia de nivel superior de un
-- `psql -f` corre en autocommit— así que se quitó en vez de dejar un
-- statement sin efecto garantizado en todos los caminos de ejecución.
--
-- Tabla marcadora de una-sola-vez (guarda (b) de arriba). `CREATE TABLE
-- IF NOT EXISTS` es, en sí misma, una sentencia idempotente: no necesita
-- ninguna garantía de atomicidad — si este archivo se re-ejecutara por
-- fuera de Prisma (uso ya prohibido más arriba), esta línea puede volver
-- a correr sin riesgo. La atomicidad la necesita el PAR check+INSERT del
-- DO $$ de más abajo, que sí vive en una sola sentencia/transacción junto
-- con el backfill.
CREATE TABLE IF NOT EXISTS _utc_backfill_aplicado (
  migration         text PRIMARY KEY,
  aplicado_en       timestamptz NOT NULL,
  filas_corregidas  bigint NOT NULL
);

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
  ya_aplicado boolean;
  filas_corregidas bigint := 0;
  filas_este_update bigint;
BEGIN
  -- Guarda (b), ver cabecera: check + INSERT en la MISMA transacción
  -- implícita que el backfill de abajo. Independiente de
  -- `_prisma_migrations` a propósito — cubre el camino fallo-y-reintento.
  SELECT EXISTS (
    SELECT 1 FROM _utc_backfill_aplicado
     WHERE migration = '20260914150000_sesion_utc_y_backfill_fechas'
  ) INTO ya_aplicado;

  IF ya_aplicado THEN
    RAISE NOTICE '[sesion-utc] backfill ya aplicado segun _utc_backfill_aplicado -- no se toca ninguna fila (reintento sin efecto sobre los datos)';
    RETURN;
  END IF;

  FOR c IN
    SELECT col.table_name, col.column_name
      FROM information_schema.columns col
      JOIN information_schema.tables t
        ON t.table_schema = col.table_schema AND t.table_name = col.table_name
     WHERE col.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND col.udt_name = 'timestamptz'
       AND col.table_name <> '_prisma_migrations'
       AND col.table_name <> '_utc_backfill_aplicado'
     -- ORDER BY por consistencia con la migracion homonima de prisma_tenant
     -- (CRITICAL-2, sdd-verify FAIL round 1). `soporte_master` HOY no tiene
     -- ninguna columna `clock_timestamp()` ni segunda guarda que dependa
     -- del orden de `updated_at` frente a `created_at`, asi que este
     -- ORDER BY no es load-bearing en este archivo -- pero un catalogo
     -- SQL sin ORDER BY no tiene orden garantizado, y la migracion de
     -- tenant es prueba de que un orden fisico de columnas inesperado
     -- puede convertirse en un bug real. Mismo criterio en los dos
     -- schemas, aunque solo uno lo necesite hoy.
     ORDER BY col.table_name, (col.column_name <> 'created_at'), col.column_name
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
        WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0',
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name);
    GET DIAGNOSTICS filas_este_update = ROW_COUNT;
    filas_corregidas := filas_corregidas + filas_este_update;
  END LOOP;

  INSERT INTO _utc_backfill_aplicado (migration, aplicado_en, filas_corregidas)
  VALUES ('20260914150000_sesion_utc_y_backfill_fechas', clock_timestamp(), filas_corregidas);
END $$;

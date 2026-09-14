-- Migration: 20260914150000_sesion_utc_y_backfill_fechas
-- WU4 (sdd/sesion-utc-y-backfill-de-fechas), issue #173. Ref design ADR-1,
-- ADR-2, ADR-3, ADR-4. Ref tasks: 4.2.
--
-- Idéntica a la migración homónima de prisma_master (WU3) salvo esta
-- cabecera y la SEGUNDA GUARDA de más abajo, específica del schema tenant:
--
--   1. ALTER DATABASE ... SET timezone TO 'UTC' sobre la base ACTUAL
--      (segunda garantía de ADR-1, independiente de `conUtc()`): mismo
--      mecanismo que prisma_master — `format('...%I...', current_database())`
--      agnóstico del nombre (los sufijos hex de tenant cambian),
--      `insufficient_privilege` (42501) degrada a `RAISE WARNING`, nunca
--      corta la migración.
--
--   2. Backfill catalogado: recorre `information_schema` buscando toda
--      columna `timestamptz` de `public`, excluye `_prisma_migrations` y le
--      resta 3 horas a cada valor cuyo microsegundo (`EXTRACT(MICROSECONDS
--      ...) % 1000`) sea 0 — el discriminador de ADR-3. Estructuralmente NO
--      puede tocar una columna `@db.Date`.
--
--   3. SEGUNDA GUARDA (ADR-3, solo tenant): las columnas `created_at` con
--      DEFAULT `clock_timestamp()` (`movimientos_insumo`, `modelos_equipo`,
--      `familias_insumo`, `unidades_medida`, `insumos`,
--      `insumos_codigos_alternativos`) tienen una fila AMBIGUA posible: si
--      la escribió la base (created_at) casi en el mismo instante en que
--      Prisma escribió `updated_at` con el bug de sesión (+3h), el delta
--      `updated_at - created_at` cae en la banda medida
--      [2:59:55, 3:00:05] — igual que si microsegundos=0 fuera Prisma. Esa
--      fila NO se toca y se reporta con `RAISE NOTICE` (tabla, columna, id).
--      Dejarla en +3h es recuperable mañana con el mismo discriminador;
--      restarle 3h de más a una fila correcta produciría un valor -3h que
--      ningún discriminador podría volver a encontrar (ADR-3: "ante la duda
--      el backfill sub-corrige").
--
--      HALLAZGO (no estaba en el diseño original): `movimientos_insumo`
--      está en la lista de las 6 por ADR-3, pero es append-only y NO TIENE
--      columna `updated_at` (ver `prisma_tenant/schema.prisma`, modelo
--      `MovimientoInsumo`) — no existe delta que calcular ahí. La guarda se
--      salta para esa tabla EN RUNTIME (detectado por catálogo, ver
--      `tiene_updated_at` más abajo — nunca hardcodeado como "excepción a
--      mano"), y su `created_at` queda cubierto solo por el discriminador
--      primario. Eso es seguro: el mapper
--      (`MovimientoInsumoMapper.toPersistence`) omite `createdAt` a
--      propósito, así que esa columna SIEMPRE la escribe la base
--      (`clock_timestamp()`), nunca Prisma — no hay escenario real en el
--      que necesite la segunda guarda.
--
-- EJECUTAR ESTE ARCHIVO DOS VECES CORROMPE LOS DATOS (ADR-4): restar 3h no
-- cambia los microsegundos, así que una segunda corrida vuelve a
-- identificar las mismas filas ya corregidas y les resta otras 3h. La
-- garantía de ejecución exactamente-una-vez es EXTERNA a este SQL — la da
-- `_prisma_migrations` (ADR-2, R4). NUNCA correr este archivo a mano con
-- `psql`; solo vía `prisma migrate deploy` / `migrate:tenant` /
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
  fila_ambigua record;
  tiene_updated_at boolean;
  -- Las 6 columnas clock_timestamp() de ADR-3. La guarda de delta se salta
  -- en runtime, por catálogo, para la que no tenga `updated_at`
  -- (`movimientos_insumo` hoy) — ver el hallazgo en la cabecera del
  -- archivo. No se la saca de esta lista a mano: la lista documenta la
  -- INTENCIÓN de ADR-3, la detección de `tiene_updated_at` documenta la
  -- REALIDAD del schema.
  tablas_guarda_delta CONSTANT text[] := ARRAY[
    'movimientos_insumo', 'modelos_equipo', 'familias_insumo',
    'unidades_medida', 'insumos', 'insumos_codigos_alternativos'
  ];
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
     -- ORDER BY LOAD-BEARING (CRITICAL-2, sdd-verify FAIL round 1):
     -- `information_schema.columns` sin ORDER BY no da ninguna garantia de
     -- orden -- devuelve el orden fisico de declaracion de columnas de
     -- CADA tabla, que esta query no controla. La segunda guarda de ADR-3
     -- (mas abajo) lee la columna `updated_at` TAL COMO ESTA en el momento
     -- de evaluarla: si el catalogo entrega `updated_at` ANTES que
     -- `created_at` para una tabla con guarda, la guarda lee un
     -- `updated_at` YA trasladado -3h, el delta cae fuera de banda, y
     -- `created_at` se sobre-corrige -3h de mas -- exactamente el
     -- resultado irreversible que ADR-3 declara no negociable. Reproducido
     -- por sdd-verify invirtiendo el orden fisico de columnas de una tabla
     -- de prueba (ver `utc-backfill-fechas.integration.spec.ts`
     -- `[CRITICAL-2]`): sin este ORDER BY, `created_at` cambia de
     -- 20:13:00.000Z a 17:13:00.000Z. La expresion `(col.column_name <>
     -- 'created_at')` es booleana (false=0 antes que true=1 en Postgres),
     -- asi que `created_at` ordena SIEMPRE primero dentro de su tabla,
     -- pase lo que pase con el orden fisico de columnas.
     ORDER BY col.table_name, (col.column_name <> 'created_at'), col.column_name
  LOOP
    IF c.column_name = 'created_at' AND c.table_name = ANY(tablas_guarda_delta) THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = c.table_name
           AND column_name = 'updated_at'
      ) INTO tiene_updated_at;

      IF tiene_updated_at THEN
        -- Reporta CADA fila ambigua (tabla, columna, id) antes de excluirla
        -- del UPDATE — mismo criterio de diseño que el resto del archivo:
        -- lo detectable queda en el log, no en silencio.
        FOR fila_ambigua IN EXECUTE format(
          'SELECT id FROM %I
            WHERE %I IS NOT NULL
              AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0
              AND (updated_at - %I) BETWEEN INTERVAL ''2 hours 59 minutes 55 seconds''
                                         AND INTERVAL ''3 hours 0 minutes 5 seconds''',
          c.table_name, c.column_name, c.column_name, c.column_name)
        LOOP
          RAISE NOTICE
            '[sesion-utc] fila ambigua sin tocar: tabla=% columna=% id=% (microsegundos=0 y delta updated_at-created_at en banda 2:59:55-3:00:05; puede ser una fila escrita por la base)',
            c.table_name, c.column_name, fila_ambigua.id;
        END LOOP;

        EXECUTE format(
          'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
            WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0
              AND NOT ((updated_at - %I) BETWEEN INTERVAL ''2 hours 59 minutes 55 seconds''
                                              AND INTERVAL ''3 hours 0 minutes 5 seconds'')',
          c.table_name, c.column_name, c.column_name, c.column_name, c.column_name, c.column_name);
        CONTINUE;
      END IF;
      -- Tabla de la lista sin `updated_at` (`movimientos_insumo` hoy): sin
      -- delta que calcular, cae al UPDATE genérico de abajo.
    END IF;

    EXECUTE format(
      'UPDATE %I SET %I = %I - INTERVAL ''3 hours''
        WHERE %I IS NOT NULL AND EXTRACT(MICROSECONDS FROM %I)::bigint %% 1000 = 0',
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name);
  END LOOP;
END $$;
